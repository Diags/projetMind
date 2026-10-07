import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { create } from '../scripts/lib/adr.mjs';
import { allow, consentFile } from '../scripts/lib/consent.mjs';
import { actionOf, apply, planInit, planUninstall } from '../scripts/lib/init.mjs';
import { checkStaged, stagedFiles } from '../scripts/lib/precommit.mjs';

const BIN = fileURLToPath(new URL('../bin/projectmind.mjs', import.meta.url));
// The hook runs this repository's command line, not the published package.
const CLI = `node "${BIN.replace(/\\/g, '/')}"`;
const roots = [];
after(() => roots.forEach((root) => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(consentFile(root), { force: true });
}));

const write = (root, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};
const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'core.autocrlf=false', ...args], { cwd: root, stdio: 'pipe' });
const commit = (root, message) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', message], { cwd: root, encoding: 'utf8' });

// Repository: ADR-001 protects src/a.js; src/free.js is free.
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  write(root, 'src/a.js', 'a\n');
  write(root, 'src/free.js', 'b\n');
  create(root, { title: 'A is frozen', reason: 'Because.', protected_files: ['src/a.js'], context: 'c', decision: 'd' });
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

test('checkStaged: the staged files protected by an active ADR and not allowed', () => {
  const root = repo();
  write(root, 'src/a.js', 'a2\n');
  write(root, 'src/free.js', 'b2\n');
  git(root, 'add', '.');
  assert.deepEqual(stagedFiles(root).sort(), ['src/a.js', 'src/free.js']);
  assert.deepEqual(checkStaged(root).map((p) => [p.file, p.hits.map((h) => h.adr.id)]), [['src/a.js', ['ADR-001']]]);
  allow(root, [path.join(root, 'src', 'a.js')]);
  assert.equal(checkStaged(root), null);
});

test('checkStaged: ADR files may be committed, new or changed', () => {
  const root = repo();
  create(root, { title: 'New', reason: 'r', context: 'c', decision: 'd' });
  fs.appendFileSync(path.join(root, 'docs', 'decisions', 'ADR-001-a-is-frozen.md'), 'More.\n');
  git(root, 'add', '.');
  assert.equal(checkStaged(root), null);
});

test('the pre-commit hook from init refuses a protected file, citing the ADR, until the user allows it', () => {
  const root = repo();
  const notes = [];
  const changes = planInit(root, ['git'], { cli: CLI, notes });
  assert.deepEqual(notes, []);
  assert.deepEqual(changes.map((c) => [c.file, actionOf(c)]), [['.git/hooks/pre-commit', 'create']]);
  apply(root, changes);

  write(root, 'src/free.js', 'b2\n');
  git(root, 'add', '.');
  assert.equal(commit(root, 'free file').status, 0, 'a free file is committed');

  write(root, 'src/a.js', 'a2\n');
  git(root, 'add', '.');
  const refused = commit(root, 'protected file');
  assert.notEqual(refused.status, 0, 'the commit is refused');
  assert.match(refused.stderr, /ProjectMind: this commit changes files that a recorded decision protects\./);
  assert.match(refused.stderr, /ADR-001 — A is frozen \[pattern: src\/a\.js\]/);
  assert.match(refused.stderr, /allow src\/a\.js/);

  const allowed = spawnSync(process.execPath, [BIN, 'allow', '--root', root, 'src/a.js'], { encoding: 'utf8' });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(commit(root, 'protected file, agreed').status, 0, 'committed once the user allowed it');
});

test('init leaves an existing hook or another hook manager alone, and says what to add', () => {
  const foreign = repo();
  write(foreign, '.git/hooks/pre-commit', '#!/bin/sh\nnpm run lint\n');
  const notes = [];
  assert.deepEqual(planInit(foreign, ['git'], { cli: CLI, notes }), []);
  assert.match(notes[0], /^git: \.git\/hooks\/pre-commit already exists; add `.+ check-staged` to it\.$/);
  assert.deepEqual(planUninstall(foreign).filter((c) => actionOf(c) !== 'unchanged'), [], 'uninstall keeps a hook that is not ours');

  const managed = repo();
  git(managed, 'config', 'core.hooksPath', '.husky');
  const managedNotes = [];
  assert.deepEqual(planInit(managed, ['git'], { cli: CLI, notes: managedNotes }), []);
  assert.match(managedNotes[0], /core\.hooksPath is set to \.husky/);
});

test('uninstall removes the pre-commit hook that init wrote', () => {
  const root = repo();
  apply(root, planInit(root, ['git'], { cli: CLI }));
  assert.ok(fs.existsSync(path.join(root, '.git', 'hooks', 'pre-commit')));
  apply(root, planUninstall(root), { pruneFolders: true });
  assert.equal(fs.existsSync(path.join(root, '.git', 'hooks', 'pre-commit')), false);
  assert.ok(fs.existsSync(path.join(root, '.git', 'hooks')), 'git\'s own hooks folder stays');
});

test('projectmind check-staged: an internal error lets the commit through', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  roots.push(outside);
  const r = spawnSync(process.execPath, [BIN, 'check-staged', '--root', outside], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /^ProjectMind: pre-commit check failed, commit not checked/);
});
