// Gemini CLI adapter for the guard (ADR-004, ADR-005), for the BeforeTool hook of
// .gemini/settings.json. Gemini CLI hooks can allow or deny but not ask, so a protected edit is
// denied with a reason, which Gemini sends to the agent as a tool error.
// Docs: geminicli.com/docs/hooks/reference/ and geminicli.com/docs/tools/file-system/.

import path from 'node:path';
import { check } from '../consent.mjs';
import { consentInstruction, findRoot, pathsIn } from './common.mjs';

const EDIT_TOOLS = new Set(['write_file', 'replace']);

// Returns { stdout, code }: what the hook prints and its exit code.
export function answer(input, { now } = {}) {
  const allowOutput = { stdout: JSON.stringify({ decision: 'allow' }), code: 0 };
  if (!EDIT_TOOLS.has(input?.tool_name)) return allowOutput;
  const cwd = input.cwd || process.cwd();
  const root = findRoot(cwd);
  const files = pathsIn(input.tool_input).map((f) => path.resolve(cwd, f));
  const result = check(root, files, now);
  if (!result) return allowOutput;
  const reason = `${result.message}\n\n${consentInstruction('Gemini CLI', result.blocked.map((p) => p.file))}`;
  return { stdout: JSON.stringify({ decision: 'deny', reason }), code: 0 };
}

// Exit codes other than 0 and 2 are a warning: the tool call proceeds.
export const failure = { code: 1 };
