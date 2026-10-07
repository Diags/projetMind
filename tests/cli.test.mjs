import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/projectmind.mjs', import.meta.url));
const PKG = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const temporary = [];
after(() => temporary.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const run = (args, options = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', ...options });

test('projectmind: --version, --help, and an unknown command', () => {
  const version = run(['--version']);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), PKG.version);
  for (const args of [['--help'], []]) {
    const help = run(args);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^Usage: projectmind <command> \[options\]/);
    for (const command of ['init', 'uninstall', 'adr list', 'adr create', 'why', 'release-check', 'guard', 'allow']) {
      assert.match(help.stdout, new RegExp(`\\n  ${command} `));
    }
  }
  const unknown = run(['nope']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /^unknown command: nope/);
});

test('projectmind adr, why and release-check run the same scripts as the skills', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporary.push(root);
  const input = JSON.stringify({ title: 'T', reason: 'R', protected_files: ['a.js'], context: 'c', decision: 'd' });
  const created = run(['adr', 'create', '--root', root], { input });
  assert.equal(created.status, 0, created.stderr);
  assert.equal(created.stdout.trim(), 'ADR created: docs/decisions/ADR-001-t.md');
  assert.equal(JSON.parse(run(['adr', 'list', '--root', root]).stdout)[0].id, 'ADR-001');

  const why = run(['why', '--root', root, 'a.js']);
  assert.equal(why.status, 0, why.stderr);
  assert.match(why.stdout, /- ADR-001 "T" — docs\/decisions\/ADR-001-t\.md/);

  const usage = run(['adr']);
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /projectmind adr list/, 'the usage names the projectmind command');
  assert.match(run(['why']).stderr, /^Usage: projectmind why /);

  const check = run(['release-check', '--root', root, '--no-check']);
  assert.equal(check.status, 2, 'not a git repository');
  assert.match(check.stderr, /not a git repository/);
});
