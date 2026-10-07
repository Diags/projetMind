#!/usr/bin/env node
// ProjectMind PreToolUse hook for Claude Code, declared in hooks/hooks.json: the same entry point
// as `projectmind guard claude-code`. A file protected by an active ADR gets a confirmation
// request; otherwise nothing is printed and the tool proceeds. On error, exit code 1 lets the
// tool proceed: the guard never blocks the work (ADR-005).

import { run } from '../scripts/guard.mjs';

process.exitCode = run(['claude-code']);
