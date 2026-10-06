#!/usr/bin/env node
// Command-line tool for ADRs, called by the /projectmind:remember skill.
//   node adr.mjs list [--root <dir>]
//   node adr.mjs create [--dry-run] [--root <dir>]    the ADR comes as JSON on stdin

import fs from 'node:fs';
import { create, readDecisions, AdrError } from './lib/adr.mjs';

const USAGE = `Usage:
  node adr.mjs list [--root <dir>]
  node adr.mjs create [--dry-run] [--root <dir>]   (JSON object on stdin)`;

function readOptions(args) {
  const options = { root: process.cwd(), dryRun: false };
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--dry-run') options.dryRun = true;
    else if (args[k] === '--root' && args[k + 1]) options.root = args[++k];
    else throw new AdrError([`unknown option: ${args[k]}`]);
  }
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    throw new AdrError([`project folder not found: ${options.root}`]);
  }
  return options;
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'list') {
    const { root } = readOptions(args);
    console.log(JSON.stringify(readDecisions(root), null, 2));
  } else if (command === 'create') {
    const { root, dryRun } = readOptions(args);
    let input;
    try {
      input = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      throw new AdrError([`invalid JSON on stdin: ${e.message}`]);
    }
    const { file, content } = create(root, input, { dryRun });
    if (dryRun) process.stdout.write(`Preview, nothing written: ${file}\n\n${content}`);
    else console.log(`ADR created: ${file}`);
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
} catch (e) {
  if (!(e instanceof AdrError)) throw e;
  console.error(`Error:\n- ${e.errors.join('\n- ')}`);
  process.exitCode = 1;
}
