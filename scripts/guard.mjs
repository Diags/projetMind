#!/usr/bin/env node
// Hook entry point for every AI tool (ADR-004, ADR-005): `projectmind guard <tool>` reads the
// tool's hook input on stdin and answers in that tool's format. An internal error never blocks
// the edit: it prints nothing and exits with the code that lets that tool proceed.

import fs from 'node:fs';
import * as claudeCode from './lib/adapters/claude-code.mjs';
import * as codex from './lib/adapters/codex.mjs';
import * as copilot from './lib/adapters/copilot.mjs';
import * as cursor from './lib/adapters/cursor.mjs';
import * as gemini from './lib/adapters/gemini.mjs';
import { isMain } from './lib/cli.mjs';

export const TOOLS = { 'claude-code': claudeCode, codex, copilot, cursor, gemini };

// Returns the exit code. A wrong tool name exits 1, which most tools treat as a non-blocking error.
export function run(args, { stdin = () => fs.readFileSync(0, 'utf8'), env = process.env, name = 'node guard.mjs' } = {}) {
  if (args.length !== 1 || !Object.hasOwn(TOOLS, args[0])) {
    console.error(`Usage: ${name} <${Object.keys(TOOLS).join('|')}>   (the tool's hook input on stdin)`);
    return 1;
  }
  const tool = TOOLS[args[0]];
  try {
    const input = JSON.parse(stdin().replace(/^﻿/, ''));
    const { stdout, code } = tool.answer(input, { env });
    if (stdout) process.stdout.write(stdout);
    return code;
  } catch (e) {
    console.error(`ProjectMind: guard error, edit not checked: ${e.message}`);
    return tool.failure.code;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
