import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { create } from '../scripts/lib/adr.mjs';
import { allow, allowedFiles, check, consentFile } from '../scripts/lib/consent.mjs';
import { findRoot, pathsIn, patchPaths } from '../scripts/lib/adapters/common.mjs';
import * as codex from '../scripts/lib/adapters/codex.mjs';
import * as copilot from '../scripts/lib/adapters/copilot.mjs';
import * as cursor from '../scripts/lib/adapters/cursor.mjs';
import * as gemini from '../scripts/lib/adapters/gemini.mjs';

const BIN = fileURLToPath(new URL('../bin/projectmind.mjs', import.meta.url));
const roots = [];
after(() => roots.forEach((root) => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(consentFile(root), { force: true });
}));

// Throwaway project: ADR-001 protects src/a.js.
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  roots.push(root);
  create(root, { title: 'Frozen runtime', reason: 'Test reason.', protected_files: ['src/a.js'], context: 'c', decision: 'd' });
  return root;
}
const patch = (...lines) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n');
const PASS = { stdout: '', code: 0 };

test('patchPaths: every file of a Codex patch, following the official grammar', () => {
  const text = [
    "<<'EOF'",
    '*** Begin Patch',
    '*** Add File: docs/new.md',
    '+*** Update File: not/a/file.txt',
    '+text',
    '*** Update File: src/a.js',
    '*** Move to: src/b.js',
    '@@ function a()',
    '-old',
    '+new',
    '  *** Delete File: old/c.js ',
    '*** End Patch',
    'EOF',
  ].join('\n');
  assert.deepEqual(patchPaths(text), ['docs/new.md', 'src/a.js', 'src/b.js', 'old/c.js']);
});

test('pathsIn: path fields, lists of paths, patch texts and JSON strings', () => {
  assert.deepEqual(pathsIn({ file_path: 'a' }), ['a']);
  assert.deepEqual(pathsIn({ path: 'a', paths: ['b', 3, ''] }), ['a', 'b']);
  assert.deepEqual(pathsIn(JSON.stringify({ filePath: 'c' })), ['c']);
  assert.deepEqual(pathsIn({ input: patch('*** Update File: d') }), ['d']);
  assert.deepEqual(pathsIn(patch('*** Add File: e', '+x')), ['e']);
  assert.deepEqual(pathsIn('not json'), []);
  assert.deepEqual(pathsIn(null), []);
});

test('findRoot: the nearest folder that holds docs/decisions or .git', () => {
  const root = project();
  assert.equal(findRoot(path.join(root, 'src', 'deep')), root);
  assert.equal(findRoot(root), root);
});

test('consent: allow lets a protected file through until the permission expires', () => {
  const root = project();
  const file = path.join(root, 'src', 'a.js');
  const now = 1_000_000;
  assert.deepEqual(check(root, [file, file], now).blocked.map((p) => p.file), ['src/a.js']);
  assert.equal(check(root, [path.join(root, 'src', 'b.js')], now), null);
  assert.deepEqual(allow(root, [file], { minutes: 10, now }), ['src/a.js']);
  assert.deepEqual([...allowedFiles(root, now + 1)], ['src/a.js']);
  assert.equal(check(root, [file], now + 9 * 60_000), null);
  assert.notEqual(check(root, [file], now + 10 * 60_000), null, 'expired after 10 minutes');
  assert.throws(() => allow(root, [path.join(root, '..', 'elsewhere.js')]), /outside the project/);
});

test('Codex: a patch on a protected file is denied, with the way to get consent', () => {
  const root = project();
  const call = (command, cwd = root) => ({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command }, cwd });
  const r = codex.answer(call(patch('*** Update File: src/a.js', '@@', '-a', '+b')), { now: 0 });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /ADR-001 — Frozen runtime/);
  assert.match(out.permissionDecisionReason, /`npx --yes @diags\/projectmind@\d+\.\d+\.\d+ allow src\/a\.js`/);
  const fromSubfolder = codex.answer(call(patch('*** Update File: a.js'), path.join(root, 'src')), { now: 0 });
  assert.equal(JSON.parse(fromSubfolder.stdout).hookSpecificOutput.permissionDecision, 'deny', 'paths are relative to cwd');
  assert.deepEqual(codex.answer(call(patch('*** Add File: src/free.js', '+x')), { now: 0 }), PASS);
  assert.deepEqual(codex.answer({ tool_name: 'Bash', tool_input: { command: 'rm src/a.js' }, cwd: root }), PASS);
  allow(root, [path.join(root, 'src', 'a.js')], { now: 0 });
  assert.deepEqual(codex.answer(call(patch('*** Update File: src/a.js')), { now: 1 }), PASS, 'allowed by the user');
});

test('Cursor: always a complete JSON answer; deny carries a message for the agent and the user', () => {
  const root = project();
  const call = (tool_name, tool_input) => ({ hook_event_name: 'preToolUse', tool_name, tool_input, cwd: root, workspace_roots: [root] });
  const out = JSON.parse(cursor.answer(call('Write', { file_path: path.join(root, 'src', 'a.js') }), { env: {}, now: 0 }).stdout);
  assert.equal(out.permission, 'deny');
  assert.equal(out.agent_message, out.user_message);
  assert.match(out.agent_message, /ADR-001 — Frozen runtime[\s\S]*Cursor cannot ask the user/);
  assert.equal(JSON.parse(cursor.answer(call('Delete', { path: 'src/a.js' }), { env: {}, now: 0 }).stdout).permission, 'deny');
  assert.equal(JSON.parse(cursor.answer(call('Write', { file_path: 'src/a.js' }), { env: { CURSOR_PROJECT_DIR: root }, now: 0 }).stdout).permission, 'deny');
  for (const free of [call('Write', { file_path: 'src/b.js' }), call('Shell', { command: 'rm src/a.js' }), call('Write', {})]) {
    assert.deepEqual(cursor.answer(free, { env: {}, now: 0 }), { stdout: '{"permission":"allow"}', code: 0 });
  }
});

test('Copilot: asks, in both of its input formats, and only for editing tools', () => {
  const root = project();
  const ask = (input) => JSON.parse(copilot.answer(input, { now: 0 }).stdout);
  const own = ask({ toolName: 'edit', toolArgs: JSON.stringify({ path: 'src/a.js' }), cwd: root });
  assert.deepEqual(Object.keys(own), ['permissionDecision', 'permissionDecisionReason']);
  assert.equal(own.permissionDecision, 'ask');
  assert.match(own.permissionDecisionReason, /ADR-001 — Frozen runtime/);
  assert.equal(ask({ hook_event_name: 'PreToolUse', tool_name: 'create', tool_input: { path: path.join(root, 'src', 'a.js') }, cwd: root }).permissionDecision, 'ask');
  assert.equal(ask({ toolName: 'apply_patch', toolArgs: { input: patch('*** Update File: src/a.js') }, cwd: root }).permissionDecision, 'ask');
  for (const free of [
    { toolName: 'view', toolArgs: { path: 'src/a.js' }, cwd: root },
    { toolName: 'bash', toolArgs: { command: 'rm src/a.js' }, cwd: root },
    { toolName: 'edit', toolArgs: { path: 'src/b.js' }, cwd: root },
  ]) assert.deepEqual(copilot.answer(free, { now: 0 }), PASS);
});

test('Gemini CLI: deny with a reason for the agent, allow otherwise', () => {
  const root = project();
  const out = JSON.parse(gemini.answer({
    hook_event_name: 'BeforeTool', tool_name: 'replace', tool_input: { file_path: path.join(root, 'src', 'a.js'), old_string: 'a', new_string: 'b' }, cwd: root,
  }, { now: 0 }).stdout);
  assert.equal(out.decision, 'deny');
  assert.match(out.reason, /ADR-001 — Frozen runtime[\s\S]*Gemini CLI cannot ask the user/);
  const ALLOW = { stdout: '{"decision":"allow"}', code: 0 };
  assert.deepEqual(gemini.answer({ tool_name: 'write_file', tool_input: { file_path: 'src/b.js' }, cwd: root }, { now: 0 }), ALLOW);
  assert.deepEqual(gemini.answer({ tool_name: 'run_shell_command', tool_input: { command: 'rm src/a.js' }, cwd: root }, { now: 0 }), ALLOW);
});

const runBin = (args, input, env = {}) => spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8', env: { ...process.env, ...env } });

test('projectmind guard: an internal error never blocks the edit, in each tool\'s own terms', () => {
  for (const [tool, code] of Object.entries({ 'claude-code': 1, codex: 1, cursor: 1, gemini: 1, copilot: 0 })) {
    const r = runBin(['guard', tool], '{ not json');
    assert.equal(r.status, code, tool);
    assert.equal(r.stdout, '', `${tool} prints nothing`);
    assert.match(r.stderr, /^ProjectMind: guard error, edit not checked/);
  }
  const usage = runBin(['guard', 'nope'], '{}');
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /^Usage: projectmind guard <claude-code\|codex\|copilot\|cursor\|gemini>/);
});

test('projectmind guard then allow: the whole consent round trip, with Cursor', () => {
  const root = project();
  const input = JSON.stringify({ hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { file_path: path.join(root, 'src', 'a.js') }, cwd: root });
  const env = { CURSOR_PROJECT_DIR: root };
  assert.equal(JSON.parse(runBin(['guard', 'cursor'], input, env).stdout).permission, 'deny');
  const allowed = runBin(['allow', '--root', root, 'src/a.js']);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.stdout.trim(), 'Allowed for 10 min: src/a.js (ADR-001)');
  assert.equal(JSON.parse(runBin(['guard', 'cursor'], input, env).stdout).permission, 'allow');
  assert.equal(runBin(['allow']).status, 2);
  assert.equal(runBin(['allow', '--minutes', '0', 'x']).status, 2);
});
