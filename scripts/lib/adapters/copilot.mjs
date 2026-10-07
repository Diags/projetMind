// GitHub Copilot adapter for the guard (ADR-004, ADR-005): Copilot CLI and cloud agent hooks in
// .github/hooks/*.json, in their own format (toolName, toolArgs) or the VS Code compatible one
// (tool_name, tool_input). Copilot CLI asks the user; the cloud agent treats "ask" as "deny".
// A preToolUse command hook that crashes or exits non-zero denies the tool call, so an internal
// error must exit 0 and print nothing. Docs: docs.github.com/en/copilot/reference/hooks-configuration.

import path from 'node:path';
import { check } from '../consent.mjs';
import { findRoot, pathsIn } from './common.mjs';

// Copilot's editing tools (create, edit, str_replace_editor, apply_patch), their Claude Code names
// when the hook uses Claude matchers, and VS Code's own names, which the saved docs don't list.
const EDIT_TOOL = /edit|write|create|replace|patch|insert|delete/i;

// Returns { stdout, code }: what the hook prints and its exit code.
export function answer(input, { now } = {}) {
  const tool = input?.toolName ?? input?.tool_name;
  if (typeof tool !== 'string' || !EDIT_TOOL.test(tool)) return { stdout: '', code: 0 };
  const cwd = input.cwd || process.cwd();
  const root = findRoot(cwd);
  const files = pathsIn(input.toolArgs ?? input.tool_input).map((f) => path.resolve(cwd, f));
  const result = check(root, files, now);
  if (!result) return { stdout: '', code: 0 };
  return { stdout: JSON.stringify({ permissionDecision: 'ask', permissionDecisionReason: result.message }), code: 0 };
}

// Empty output keeps Copilot's default behaviour; any non-zero exit would deny the edit.
export const failure = { code: 0 };
