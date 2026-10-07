#!/usr/bin/env node
// Command-line tool for ADRs, called by the /projectmind:remember skill and by `projectmind adr`.
//   node adr.mjs list [--root <dir>]
//   node adr.mjs create [--dry-run] [--root <dir>] [--input <file>]
// The ADR comes as a JSON object, from --input or else on stdin (PowerShell has no "<").

import fs from 'node:fs';
import { create, readDecisions, AdrError } from './lib/adr.mjs';
import { handleError, isMain } from './lib/cli.mjs';

const usage = (name) => `Usage:
  ${name} list [--root <dir>]
  ${name} create [--dry-run] [--root <dir>] [--input <file>]   (JSON object in the file, or on stdin)`;

function readOptions(args) {
  const options = { root: process.cwd(), dryRun: false, input: null };
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--dry-run') options.dryRun = true;
    else if (args[k] === '--root' && args[k + 1]) options.root = args[++k];
    else if (args[k] === '--input' && args[k + 1]) options.input = args[++k];
    else throw new AdrError([`unknown option: ${args[k]}`]);
  }
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    throw new AdrError([`project folder not found: ${options.root}`]);
  }
  return options;
}

// Returns the exit code: 0, 1 on an error, 2 on a usage error.
export function run(args, name = 'node adr.mjs') {
  try {
    const [command, ...rest] = args;
    if (command === 'list') {
      const { root } = readOptions(rest);
      console.log(JSON.stringify(readDecisions(root), null, 2));
    } else if (command === 'create') {
      const { root, dryRun, input: from } = readOptions(rest);
      let text;
      try {
        text = fs.readFileSync(from ?? 0, 'utf8');
      } catch (e) {
        throw new AdrError([`cannot read ${from}: ${e.message}`]);
      }
      let input;
      try {
        input = JSON.parse(text.replace(/^﻿/, ''));
      } catch (e) {
        throw new AdrError([`invalid JSON ${from ? `in ${from}` : 'on stdin'}: ${e.message}`]);
      }
      const { file, content } = create(root, input, { dryRun });
      if (dryRun) process.stdout.write(`Preview, nothing written: ${file}\n\n${content}`);
      else console.log(`ADR created: ${file}`);
    } else {
      console.error(usage(name));
      return 2;
    }
    return 0;
  } catch (e) {
    return handleError(e, 1);
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
