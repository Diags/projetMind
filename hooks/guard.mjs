#!/usr/bin/env node
// ProjectMind PreToolUse hook, declared in hooks/hooks.json.
// File protected by an active ADR → confirmation request; otherwise nothing, the tool proceeds.
// On error, exit code 1 lets the tool proceed: the guard never blocks the work (ADR-005).

import fs from 'node:fs';
import { decide } from '../scripts/lib/adapters/claude-code.mjs';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, ''));
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const output = decide(input, root);
  if (output) process.stdout.write(JSON.stringify(output));
} catch (e) {
  console.error(`ProjectMind: guard error, edit not checked: ${e.message}`);
  process.exitCode = 1;
}
