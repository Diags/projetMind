// Cursor adapter for the guard (ADR-004, ADR-005), for the preToolUse hook of .cursor/hooks.json.
// Cursor accepts "ask" in its schema without enforcing it for preToolUse, so a protected edit is
// denied with a reason for the agent and for the user. Cursor blocks the action when a permission
// hook exits 0 with invalid or empty JSON: the answer is always a complete JSON object.
// Docs: cursor.com/docs/hooks.

import path from 'node:path';
import { check } from '../consent.mjs';
import { consentInstruction, pathsIn } from './common.mjs';

// Write covers file edits (Claude Code's Edit maps to it); Delete is a tool of its own.
const EDIT_TOOLS = new Set(['Write', 'Delete', 'Edit']);

// Returns { stdout, code }: what the hook prints and its exit code.
export function answer(input, { env = process.env, now } = {}) {
  const allowOutput = { stdout: JSON.stringify({ permission: 'allow' }), code: 0 };
  if (!EDIT_TOOLS.has(input?.tool_name)) return allowOutput;
  const root = env.CURSOR_PROJECT_DIR || input.workspace_roots?.[0] || input.cwd || process.cwd();
  const base = input.cwd || root;
  const files = pathsIn(input.tool_input).map((f) => path.resolve(base, f));
  const result = check(root, files, now);
  if (!result) return allowOutput;
  const reason = `${result.message}\n\n${consentInstruction('Cursor', result.blocked.map((p) => p.file))}`;
  return { stdout: JSON.stringify({ permission: 'deny', user_message: reason, agent_message: reason }), code: 0 };
}

// Any exit code other than 0 and 2 lets the action proceed, as long as nothing is printed.
export const failure = { code: 1 };
