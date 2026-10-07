import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { create } from '../scripts/lib/adr.mjs';
import { WARN, FAIL, OK, releaseCheck, format, readConfig, detectCheck } from '../scripts/lib/release-check.mjs';

const CLI = fileURLToPath(new URL('../scripts/release-check.mjs', import.meta.url));
const GITLEAKS = spawnSync('gitleaks', ['version']).status === 0;
// Fake secret assembled at run time: it never appears in clear in this file.
// In the real format (base32: letters and digits 2 to 7), otherwise gitleaks rightly ignores it.
const FAKE_KEY = ['AKIA', 'Q7XZ2M4N', '6P3R5T2V'].join('');

const temporary = [];
after(() => temporary.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const write = (root, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};
const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'core.autocrlf=false', ...args], { cwd: root, stdio: 'pipe' });
const section = (report, id) => report.sections.find((s) => s.id === id);

// main: src/a.js protected by ADR-001. The branch touches it, modifies ADR-001, adds ADR-002,
// a file with a fake AWS key on line 2, and a .env file.
function repo({ clean = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporary.push(root);
  git(root, 'init', '-q', '-b', 'main');
  write(root, 'src/a.js', 'a\n');
  write(root, 'src/free.js', 'b\n');
  create(root, {
    title: 'A is frozen',
    reason: 'Because.',
    protected_files: clean ? ['src/a.js'] : ['src/a.js', 'old/**'],
    context: 'c',
    decision: 'd',
  });
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  git(root, 'checkout', '-q', '-b', 'branch');
  write(root, 'src/free.js', 'b2\n');
  if (!clean) {
    write(root, 'src/a.js', 'a2\n');
    fs.appendFileSync(path.join(root, 'docs', 'decisions', 'ADR-001-a-is-frozen.md'), 'Addition.\n');
    create(root, { title: 'New', reason: 'r', context: 'c', decision: 'd' });
    write(root, 'src/config.js', `// settings\nconst key = "${FAKE_KEY}";\n`);
    write(root, '.env', 'X=1\n');
    write(root, '.env.example', 'X=\n');
  }
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'work');
  return root;
}

test('full report: ADRs touched, secrets masked, failing command → ✗', () => {
  const root = repo();
  const r = releaseCheck(root, { check: 'echo broken; exit 3', gitleaks: false });
  assert.equal(r.branch, 'branch');
  assert.equal(r.base, 'main');
  assert.equal(r.commits, 1);

  const check = section(r, 'check');
  assert.equal(check.state, FAIL);
  assert.match(check.lines[0], /^echo broken; exit 3 → exit 3, \d+ s$/);
  assert.equal(fs.readFileSync(check.log, 'utf8').trim(), 'broken');
  fs.rmSync(check.log);

  const adr = section(r, 'adr');
  assert.equal(adr.state, WARN);
  assert.deepEqual(adr.lines, [
    'ADR modified on the branch: docs/decisions/ADR-001-a-is-frozen.md — review it in the PR',
    'ADR added: docs/decisions/ADR-002-new.md',
    'src/a.js touched — protected by ADR-001 "A is frozen" (pattern: src/a.js)',
    'ADR-001: pattern "old/**" matches no tracked file',
  ]);

  const secrets = section(r, 'secrets');
  assert.equal(secrets.state, FAIL);
  assert.deepEqual(secrets.lines.slice(1), [
    '.env — sensitive file committed by the branch',
    'src/config.js:2 — AWS key',
  ]);
  assert.match(secrets.lines[0], /built-in patterns .* gitleaks not installed/);

  assert.equal(r.verdict, FAIL);
  const text = format(r);
  assert.doesNotMatch(text, new RegExp(FAKE_KEY), 'the secret value must never come out');
  assert.match(text, /Verdict: ✗ Not ready\n$/);
});

test('gitleaks, when installed: finds the key and masks its value', { skip: !GITLEAKS && 'gitleaks not installed' }, () => {
  const root = repo();
  const secrets = section(releaseCheck(root, { noCheck: true }), 'secrets');
  assert.equal(secrets.state, FAIL);
  assert.match(secrets.lines[0], /gitleaks \d/);
  assert.ok(secrets.lines.some((l) => /^src\/config\.js:2 — \S+ \(commit [0-9a-f]{7}\)$/.test(l)), secrets.lines.join('\n'));
  assert.doesNotMatch(secrets.lines.join('\n'), new RegExp(FAKE_KEY));
});

test('clean branch and green command → ✓ Ready', () => {
  const root = repo({ clean: true });
  const r = releaseCheck(root, { check: 'echo ok', gitleaks: false });
  assert.deepEqual(r.sections.map((s) => [s.id, s.state]), [
    ['check', OK],
    ['adr', OK],
    ['secrets', OK],
    ['worktree', OK],
  ]);
  assert.deepEqual(section(r, 'adr').lines, ['1 ADR(s) read: no protected file touched, no anomaly']);
  assert.match(format(r), /Verdict: ✓ Ready\n$/);
  fs.rmSync(section(r, 'check').log);
});

test('no declared command, or uncommitted files → ⚠', () => {
  const root = repo({ clean: true });
  write(root, 'draft.txt', 'x');
  const r = releaseCheck(root, { gitleaks: false });
  assert.equal(section(r, 'check').state, WARN);
  assert.match(section(r, 'check').lines[0], /no check command declared or detected/);
  assert.equal(section(r, 'check').log, undefined);
  assert.equal(section(r, 'worktree').state, WARN);
  assert.equal(r.verdict, WARN);
});

test('the command and the base come from .projectmind.json', () => {
  const root = repo({ clean: true });
  write(root, '.projectmind.json', JSON.stringify({ check: 'echo from config', base: 'main', unknown: 1 }));
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'config');
  assert.deepEqual(readConfig(root), {
    config: { check: 'echo from config', base: 'main' },
    errors: ['.projectmind.json: unknown key "unknown"'],
    file: '.projectmind.json',
  });
  const r = releaseCheck(root, { gitleaks: false });
  assert.equal(section(r, 'config').state, WARN);
  assert.match(section(r, 'check').lines[0], /^echo from config → exit 0/);
  fs.rmSync(section(r, 'check').log);
});

test('pre-v2 settings: .claude/projectmind.json and the "controle" key are still read', () => {
  const root = repo({ clean: true });
  assert.deepEqual(readConfig(root), { config: {}, errors: [], file: null });
  write(root, '.claude/projectmind.json', JSON.stringify({ controle: 'echo old' }));
  assert.deepEqual(readConfig(root), { config: { check: 'echo old' }, errors: [], file: '.claude/projectmind.json' });
  write(root, '.projectmind.json', JSON.stringify({ controle: 'echo a', check: 'echo b' }));
  const { config, errors, file } = readConfig(root);
  assert.deepEqual(config, { check: 'echo b' });
  assert.equal(file, '.projectmind.json');
  assert.deepEqual(errors, [
    '.claude/projectmind.json ignored: .projectmind.json takes precedence',
    '.projectmind.json: "check" and "controle" are the same setting: "check" is kept',
  ]);
});

test('detectCheck: the usual test command, from the files that announce it', () => {
  const npm = (test) => JSON.stringify({ scripts: { test } });
  const cases = [
    [{}, null],
    [{ 'package.json': npm('echo "Error: no test specified" && exit 1') }, null],
    [{ 'package.json': JSON.stringify({ scripts: { build: 'tsc' } }) }, null],
    [{ 'package.json': npm('node --test') }, { command: 'npm test', from: 'package.json' }],
    [{ 'package.json': npm('vitest'), 'pnpm-lock.yaml': '' }, { command: 'pnpm test', from: 'package.json' }],
    [{ 'package.json': npm('jest'), 'yarn.lock': '' }, { command: 'yarn test', from: 'package.json' }],
    [{ 'package.json': npm('bun test'), 'bun.lock': '' }, { command: 'bun run test', from: 'package.json' }],
    [{ 'package.json': '{ broken', 'Cargo.toml': '' }, { command: 'cargo test', from: 'Cargo.toml' }],
    [{ 'go.mod': 'module x\n' }, { command: 'go test ./...', from: 'go.mod' }],
    [{ 'pytest.ini': '[pytest]\n' }, { command: 'pytest', from: 'pytest.ini' }],
    [{ 'pyproject.toml': '[project]\nname = "x"\n\n[tool.pytest.ini_options]\naddopts = "-q"\n' }, { command: 'pytest', from: 'pyproject.toml' }],
    [{ 'pyproject.toml': '[project]\nname = "x"\n' }, null],
    [{ Makefile: 'build:\n\tcc x.c\ntest: build\n\t./x\n' }, { command: 'make test', from: 'Makefile' }],
    [{ Makefile: 'build:\n\tcc x.c\n' }, null],
  ];
  for (const [files, expected] of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
    temporary.push(root);
    for (const [file, content] of Object.entries(files)) write(root, file, content);
    assert.deepEqual(detectCheck(root), expected, JSON.stringify(files));
  }
});

test('without a declared command, the detected one runs and the report says where it comes from', () => {
  const root = repo({ clean: true });
  write(root, 'package.json', JSON.stringify({ scripts: { test: 'echo detected-run' } }));
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'package');
  const check = section(releaseCheck(root, { gitleaks: false }), 'check');
  assert.equal(check.state, OK, check.lines.join('\n'));
  assert.equal(check.detectedFrom, 'package.json');
  assert.equal(check.lines[0], 'command detected from package.json: declare "check" in .projectmind.json to change it');
  assert.match(check.lines[1], /^npm test → exit 0, \d+ s$/);
  assert.match(fs.readFileSync(check.log, 'utf8'), /detected-run/);
  fs.rmSync(check.log);
  const declared = section(releaseCheck(root, { check: 'echo declared', gitleaks: false }), 'check');
  assert.equal(declared.detectedFrom, undefined, 'a declared command wins over detection');
  assert.match(declared.lines[0], /^echo declared → exit 0/);
  fs.rmSync(declared.log);
  assert.deepEqual(section(releaseCheck(root, { noCheck: true, gitleaks: false }), 'check').lines, ['not run (--no-check)']);
});

test('CLI: exit code 1 if not ready, 0 if ready, 2 if the base is not found', () => {
  const run = (root, ...args) => spawnSync(process.execPath, [CLI, '--root', root, '--no-check', ...args], { encoding: 'utf8' });
  const dirty = run(repo());
  assert.equal(dirty.status, 1, dirty.stderr);
  assert.match(dirty.stdout, /^Release check — branch \([0-9a-f]+\) against main/);
  assert.equal(run(repo({ clean: true })).status, 0);
  const noBase = run(repo({ clean: true }), '--base', 'doesnotexist');
  assert.equal(noBase.status, 2);
  assert.match(noBase.stderr, /base not found: doesnotexist/);
});
