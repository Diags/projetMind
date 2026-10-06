// Claude Code adapter for the guard (ADR-004, ADR-005): turns the PreToolUse hook call into a
// file path, then the core's answer into a confirmation request.

import { protections } from '../guard.mjs';

// Editing tool → tool_input field that holds the file path.
const TOOLS = { Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };

// Returns the hook's JSON output, or null when the tool may proceed.
export function decide(input, root) {
  const field = TOOLS[input?.tool_name];
  const p = field ? protections(root, input.tool_input?.[field]) : null;
  if (!p) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: p.message,
    },
  };
}
