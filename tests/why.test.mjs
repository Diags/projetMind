import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { create } from '../scripts/lib/adr.mjs';
import { mention, why, format } from '../scripts/lib/why.mjs';

const CLI = fileURLToPath(new URL('../scripts/why.mjs', import.meta.url));
const temporary = [];
after(() => temporary.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const emptyFolder = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporary.push(root);
  return root;
};
const write = (root, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};
const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'core.autocrlf=false', ...args], { cwd: root, stdio: 'pipe' });

const DEBT = [
  '# Debt',
  'See `src/auth/name.ts` for compound first names.',
  'The path suffix auth/name.ts counts too.',
  'The name alone name.ts counts, it is unique.',
  'Another project: config/name.ts does not count.',
  'Nor name.tsx, nor src/auth/name.ts.bak.',
  'Index files: lib/index.ts yes, index.ts alone no.',
].join('\n');

// Throwaway repository: two commits touch src/auth/name.ts, an ADR protects it and cites it.
function repo() {
  const root = emptyFolder();
  git(root, 'init', '-q');
  write(root, 'src/auth/name.ts', 'export const a = 1;\n');
  write(root, 'src/index.ts', '');
  write(root, 'lib/index.ts', '');
  write(root, 'DEBT.md', DEBT);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'First draft of the name');
  write(root, 'src/auth/name.ts', 'export const a = 2;\n');
  git(root, 'commit', '-q', '-am', 'Compound first names');
  create(root, {
    title: 'Names in NFC',
    reason: 'Comparing names requires a single form.',
    protected_files: ['src/auth/**'],
    context: 'The code in src/auth/name.ts compares strings.',
    decision: 'Everything goes through NFC.',
  });
  return root;
}

test('mention: path, path suffix, name only, and false friends', () => {
  const rel = 'src/auth/name.ts';
  assert.equal(mention('see `src/auth/name.ts`.', rel, true), 'path');
  assert.equal(mention('see ./src/auth/name.ts', rel, true), 'path');
  assert.equal(mention('see auth/name.ts', rel, true), 'path suffix');
  assert.equal(mention('see name.ts, then', rel, true), 'name only');
  assert.equal(mention('see name.ts', rel, false), null, 'name shared by several files');
  assert.equal(mention('config/name.ts', rel, true), null);
  assert.equal(mention('name.tsx', rel, true), null);
  assert.equal(mention('src/auth/name.ts.bak', rel, true), null);
  assert.equal(mention('xsrc/auth/name.ts', rel, true), null);
  assert.equal(mention('name.ts then src/auth/name.ts', rel, true), 'path', 'the most reliable wins');
});

test('why: ADRs, mentions and history, each with its source', () => {
  const root = repo();
  const r = why(root, path.join(root, 'src', 'auth', 'name.ts'));
  assert.equal(r.file, 'src/auth/name.ts');
  assert.deepEqual(r.warnings, []);

  assert.equal(r.decisions.length, 1);
  const [d] = r.decisions;
  assert.equal(d.id, 'ADR-001');
  assert.deepEqual(d.patterns, ['src/auth/**']);
  assert.equal(d.active, true);
  assert.deepEqual(d.citations.map((c) => c.by), ['path'], 'the ADR front matter is not counted as a mention');

  assert.deepEqual(r.documentation.map((m) => [m.file, m.line, m.by]), [
    ['DEBT.md', 2, 'path'],
    ['DEBT.md', 3, 'path suffix'],
    ['DEBT.md', 4, 'name only'],
  ]);

  assert.deepEqual(r.history.map((c) => c.subject), ['Compound first names', 'First draft of the name']);
  assert.match(r.history[0].hash, /^[0-9a-f]{7,}$/);
  assert.match(r.history[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

test('why: a shared name is not searched alone, and the output says so', () => {
  const root = repo();
  const r = why(root, path.join(root, 'lib', 'index.ts'));
  assert.equal(r.namesakes, 1);
  assert.deepEqual(r.documentation.map((m) => [m.line, m.by]), [[7, 'path']]);
  assert.match(format(r), /Name alone not searched: 1 other file\(s\) are named index\.ts\./);
});

test('why: finding nothing is said as is', () => {
  const root = repo();
  const text = format(why(root, path.join(root, 'src', 'index.ts')));
  assert.match(text, /No ADR protects or cites this file\./);
  assert.match(text, /No mention found\./);
});

test('why: outside a git repository, only the ADRs are read', () => {
  const root = emptyFolder();
  create(root, { title: 'T', reason: 'R', protected_files: ['a.js'], context: 'c', decision: 'd' });
  const r = why(root, path.join(root, 'a.js'));
  assert.equal(r.decisions[0].id, 'ADR-001');
  assert.equal(r.history, null);
  assert.deepEqual(r.warnings, [
    'not a git repository: only ADRs are read, without history.',
    'a.js not found on disk; searching anyway.',
  ]);
});

test('CLI: text output with the sources, error outside the project', () => {
  const root = repo();
  const r = spawnSync(process.execPath, [CLI, '--root', root, 'src/auth/name.ts'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Why src\/auth\/name\.ts\?/);
  assert.match(r.stdout, /- ADR-001 "Names in NFC" — docs\/decisions\/ADR-001-names-in-nfc\.md/);
  assert.match(r.stdout, /- DEBT\.md:2 \[path\] See `src\/auth\/name\.ts`/);
  assert.match(r.stdout, /Compound first names/);

  const outside = spawnSync(process.execPath, [CLI, '--root', root, '../elsewhere.ts'], { encoding: 'utf8' });
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /outside the project/);
});
