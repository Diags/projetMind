import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { create } from '../scripts/lib/adr.mjs';
import { matches, relativePath, isActive, protections } from '../scripts/lib/guard.mjs';
import { decide } from '../scripts/lib/adapters/claude-code.mjs';

const HOOK = fileURLToPath(new URL('../hooks/guard.mjs', import.meta.url));
const temporary = [];
after(() => temporary.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const ADR = { reason: 'Test reason.', context: 'c', decision: 'd' };

// Throwaway project: ADR-001 protects src/a.js and runtime/**, ADR-002 every .sql file,
// ADR-003 also protects src/a.js but is superseded.
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporary.push(root);
  create(root, { ...ADR, title: 'Frozen runtime', protected_files: ['src/a.js', 'runtime/**'], rejected_alternatives: ['Rewrite everything: too risky'] });
  create(root, { ...ADR, title: 'SQL migrations', protected_files: ['**/*.sql'] });
  const { file } = create(root, { ...ADR, title: 'Old rule', protected_files: ['src/a.js'] });
  const full = path.join(root, file);
  const text = fs.readFileSync(full, 'utf8');
  assert.match(text, /\nstatus: accepted\n/);
  fs.writeFileSync(full, text.replace('status: accepted', 'status: superseded by ADR-001'));
  return root;
}

// [id, patterns] of each ADR that protects the file: what does not depend on the message wording.
const hits = (p) => p.hits.map((h) => [h.adr.id, h.patterns]);

test('matches: wildcards, folders, case', () => {
  const cases = [
    ['src/a.js', 'src/a.js', true],
    ['src/a.js', 'src/a.jsx', false],
    ['runtime/**', 'runtime/x/y.py', true],
    ['runtime/**', 'runtimes/x.py', false],
    ['runtime', 'runtime/x.py', true],
    ['runtime/', 'runtime/x.py', true],
    ['*.sql', 'a.sql', true],
    ['*.sql', 'db/a.sql', false],
    ['**/*.sql', 'db/x/a.sql', true],
    ['**/*.sql', 'a.sql', true],
    ['src/**/test.js', 'src/test.js', true],
    ['src/?.js', 'src/b.js', true],
    ['./src\\a.js', 'src/a.js', true],
    ['a.b', 'axb', false],
  ];
  for (const [pattern, file, expected] of cases) assert.equal(matches(pattern, file, true), expected, `${pattern} / ${file}`);
  assert.equal(matches('SRC/A.js', 'src/a.js', false), true);
  assert.equal(matches('SRC/A.js', 'src/a.js', true), false);
});

test('relativePath: inside or outside the project', () => {
  const root = path.resolve(os.tmpdir(), 'project');
  assert.equal(relativePath(root, path.join(root, 'src', 'a.js')), 'src/a.js');
  assert.equal(relativePath(root, path.join(root, '..', 'other', 'a.js')), null);
  assert.equal(relativePath(root, root), null);
});

test('isActive: an ADR protects until its status says it is superseded, deprecated or rejected', () => {
  for (const status of ['accepted', 'proposed', 'acceptée', 'Acceptée', '', undefined]) {
    assert.equal(isActive({ status }), true, String(status));
  }
  for (const status of ['superseded by ADR-002', 'Superseded', 'deprecated', 'rejected', 'Remplacée par ADR-002', 'abandonnée', 'rejetée']) {
    assert.equal(isActive({ status }), false, status);
  }
});

test('protections: the active ADRs that protect the file, with their patterns', () => {
  const root = project();
  const p = protections(root, path.join(root, 'src', 'a.js'));
  assert.equal(p.file, 'src/a.js');
  assert.equal(p.isAdr, false);
  assert.deepEqual(hits(p), [['ADR-001', ['src/a.js']]], 'ADR-003 is superseded: it no longer protects');
  assert.deepEqual(hits(protections(root, 'src/a.js')), [['ADR-001', ['src/a.js']]], 'path relative to the root');
  assert.deepEqual(hits(protections(root, path.join(root, 'runtime', 'x', 'y.py'))), [['ADR-001', ['runtime/**']]]);
  assert.deepEqual(hits(protections(root, path.join(root, 'db', 'm', '001.sql'))), [['ADR-002', ['**/*.sql']]]);
});

test('protections: a file protected by several ADRs cites them all', () => {
  const root = project();
  create(root, { ...ADR, title: 'No SQL in runtime', protected_files: ['runtime/**/*.sql'] });
  assert.deepEqual(hits(protections(root, path.join(root, 'runtime', 'a.sql'))), [
    ['ADR-001', ['runtime/**']],
    ['ADR-002', ['**/*.sql']],
    ['ADR-004', ['runtime/**/*.sql']],
  ]);
});

test('protections: an ADR is protected, even without a pattern that targets it', () => {
  const root = project();
  const p = protections(root, path.join(root, 'docs', 'decisions', 'ADR-001-frozen-runtime.md'));
  assert.equal(p.isAdr, true);
  assert.deepEqual(p.hits, []);
  assert.equal(protections(root, path.join(root, 'docs', 'decisions', 'ADR-009-new.md')).isAdr, true);
  assert.equal(protections(root, path.join(root, 'docs', 'decisions', 'notes.md')), null);
  assert.equal(protections(root, path.join(root, 'docs', 'ADR-001-elsewhere.md')), null);
});

test('protections: nothing to say outside any protection', () => {
  const root = project();
  assert.equal(protections(root, path.join(root, 'src', 'b.js')), null);
  assert.equal(protections(root, path.join(root, '..', 'elsewhere', 'src', 'a.js')), null);
  assert.equal(protections(root, ''), null);
  assert.equal(protections(root, undefined), null);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporary.push(empty);
  assert.equal(protections(empty, path.join(empty, 'src', 'a.js')), null);
});

// The only test that reads the message text: it changes with the wording.
test('message: cites the ADR, its pattern, its reason, its rejected alternatives and its source', () => {
  const root = project();
  const { message } = protections(root, path.join(root, 'src', 'a.js'));
  assert.match(message, /^ProjectMind: src\/a\.js is protected by a recorded decision\./);
  assert.match(message, /ADR-001 — Frozen runtime \[pattern: src\/a\.js\]/);
  assert.match(message, /Reason: Test reason\./);
  assert.match(message, /Rejected alternatives: Rewrite everything: too risky/);
  assert.match(message, /Source: docs\/decisions\/ADR-001-frozen-runtime\.md/);
  assert.equal(message.split('\n\n').length, 3, 'header, one block per ADR, closing instruction');
  const adr = protections(root, path.join(root, 'docs', 'decisions', 'ADR-001-frozen-runtime.md')).message;
  assert.equal(adr.split('\n\n').length, 2, 'header and ADR warning, without the update instruction');
});

const call = (root, tool_name, relative, field = 'file_path') => ({
  hook_event_name: 'PreToolUse',
  tool_name,
  tool_input: { [field]: path.join(root, relative) },
  cwd: root,
});

test('Claude Code: every editing tool gets a confirmation request', () => {
  const root = project();
  for (const [tool, relative, field] of [
    ['Edit', 'src/a.js'],
    ['Write', 'runtime/x/y.py'],
    ['MultiEdit', 'db/m/001.sql'],
    ['NotebookEdit', 'runtime/n.ipynb', 'notebook_path'],
    ['Edit', 'docs/decisions/ADR-001-frozen-runtime.md'],
  ]) {
    assert.deepEqual(decide(call(root, tool, relative, field), root), {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: protections(root, path.join(root, relative)).message,
      },
    }, `${tool} ${relative}`);
  }
});

test('Claude Code: nothing to say outside any protection or editing tool', () => {
  const root = project();
  assert.equal(decide(call(root, 'Edit', 'src/b.js'), root), null);
  assert.equal(decide(call(root, 'Read', 'src/a.js'), root), null);
  assert.equal(decide(call(root, 'NotebookEdit', 'src/a.js'), root), null, 'NotebookEdit reads notebook_path');
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'rm src/a.js' } }, root), null);
  assert.equal(decide({ tool_name: 'Edit', tool_input: {} }, root), null);
  assert.equal(decide({ tool_name: 'Edit' }, root), null);
  assert.equal(decide(null, root), null);
});

// The fake call: the hook script, as Claude Code runs it.
const runHook = (root, input) => spawnSync(process.execPath, [HOOK], {
  input: typeof input === 'string' ? input : JSON.stringify(input),
  encoding: 'utf8',
  env: { ...process.env, CLAUDE_PROJECT_DIR: root },
});

test('hook: fake call on a protected file → "ask" JSON and exit code 0', () => {
  const root = project();
  const r = runHook(root, call(root, 'Edit', 'src/a.js'));
  assert.equal(r.status, 0, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /ADR-001 — Frozen runtime/);
});

test('hook: free file → no output and exit code 0', () => {
  const root = project();
  const r = runHook(root, call(root, 'Edit', 'src/b.js'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('hook: unreadable input → exit code 1, the tool proceeds', () => {
  const root = project();
  const r = runHook(root, '{ not json');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^ProjectMind/);
});
