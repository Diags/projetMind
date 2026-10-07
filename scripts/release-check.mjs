#!/usr/bin/env node
// Command-line tool behind /projectmind:release-check and `projectmind release-check`.
//   node release-check.mjs [--root <dir>] [--base <ref>] [--check "<command>"] [--no-check] [--json]
// Exit code: 0 if ready (✓ or ⚠), 1 if not ready (✗), 2 if the check could not run.

import fs from 'node:fs';
import { AdrError } from './lib/adr.mjs';
import { handleError, isMain } from './lib/cli.mjs';
import { FAIL, format, releaseCheck } from './lib/release-check.mjs';

export function run(args) {
  try {
    const options = {};
    let root = process.cwd();
    let json = false;
    for (let k = 0; k < args.length; k++) {
      if (args[k] === '--json') json = true;
      else if (args[k] === '--no-check') options.noCheck = true;
      else if (args[k] === '--root' && args[k + 1]) root = args[++k];
      else if (args[k] === '--base' && args[k + 1]) options.base = args[++k];
      else if (args[k] === '--check' && args[k + 1]) options.check = args[++k];
      else throw new AdrError([`unknown option: ${args[k]}`]);
    }
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new AdrError([`project folder not found: ${root}`]);
    }
    const report = releaseCheck(root, options);
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : format(report));
    return report.verdict === FAIL ? 1 : 0;
  } catch (e) {
    return handleError(e, 2);
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
