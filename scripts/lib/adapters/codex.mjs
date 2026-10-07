// Codex adapter for the guard (ADR-004, ADR-005). Codex edits files with apply_patch: the hook
// gets the patch text in tool_input.command, with paths relative to the session's cwd. Codex
// parses "ask" without enforcing it, so a protected edit is denied with a reason that tells the
// agent how to get the user's consent. Docs: developers.openai.com/codex/hooks.

import path from 'node:path';
import { check } from '../consent.mjs';
import { consentInstruction, findRoot, patchPaths } from './common.mjs';

// Returns { stdout, code }: what the hook prints and its exit code.
export function answer(input, { now } = {}) {
  if (input?.tool_name !== 'apply_patch') return { stdout: '', code: 0 };
  const cwd = input.cwd || process.cwd();
  const root = findRoot(cwd);
  const files = patchPaths(input.tool_input?.command ?? '').map((f) => path.resolve(cwd, f));
  const result = check(root, files, now);
  if (!result) return { stdout: '', code: 0 };
  const reason = `${result.message}\n\n${consentInstruction('Codex', result.blocked.map((p) => p.file))}`;
  return {
    stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }),
    code: 0,
  };
}

// A failed hook run lets the tool call proceed.
export const failure = { code: 1 };
