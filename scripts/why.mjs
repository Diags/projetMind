#!/usr/bin/env node
// Command-line tool behind /projectmind:why.
//   node why.mjs [--root <dir>] [--json] <file>

import fs from 'node:fs';
import path from 'node:path';
import { AdrError } from './lib/adr.mjs';
import { format, why } from './lib/why.mjs';

const USAGE = 'Usage: node why.mjs [--root <dir>] [--json] <file>';

try {
  const args = process.argv.slice(2);
  let root = process.cwd();
  let json = false;
  const files = [];
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--json') json = true;
    else if (args[k] === '--root' && args[k + 1]) root = args[++k];
    else if (args[k].startsWith('--')) throw new AdrError([`unknown option: ${args[k]}`]);
    else files.push(args[k]);
  }
  if (files.length !== 1) {
    console.error(USAGE);
    process.exit(2);
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new AdrError([`project folder not found: ${root}`]);
  }
  const result = why(root, path.resolve(root, files[0]));
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : format(result));
} catch (e) {
  if (!(e instanceof AdrError)) throw e;
  console.error(`Error:\n- ${e.errors.join('\n- ')}`);
  process.exitCode = 1;
}
