#!/usr/bin/env node
// Command-line tool behind /projectmind:why and `projectmind why`.
//   node why.mjs [--root <dir>] [--json] <file>

import fs from 'node:fs';
import path from 'node:path';
import { AdrError } from './lib/adr.mjs';
import { handleError, isMain } from './lib/cli.mjs';
import { format, why } from './lib/why.mjs';

// Returns the exit code: 0, 1 on an error, 2 on a usage error.
export function run(args, name = 'node why.mjs') {
  try {
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
      console.error(`Usage: ${name} [--root <dir>] [--json] <file>`);
      return 2;
    }
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new AdrError([`project folder not found: ${root}`]);
    }
    const result = why(root, path.resolve(root, files[0]));
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : format(result));
    return 0;
  } catch (e) {
    return handleError(e, 1);
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
