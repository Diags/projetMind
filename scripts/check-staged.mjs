#!/usr/bin/env node
// `projectmind check-staged`: the git pre-commit hook that `projectmind init` installs.
// Exit code 1 refuses the commit when it changes a file that a recorded decision protects.
//   node check-staged.mjs [--root <dir>]

import fs from 'node:fs';
import { AdrError } from './lib/adr.mjs';
import { isMain } from './lib/cli.mjs';
import { cliCommand } from './lib/init.mjs';
import { checkStaged } from './lib/precommit.mjs';

const quote = (f) => (/[\s"'$`]/.test(f) ? JSON.stringify(f) : f);

// Returns the exit code: 0 lets the commit through, 1 refuses it. Like the guard, an internal
// error never blocks the work: it is reported and the commit goes through.
export function run(args) {
  try {
    let root = process.cwd();
    for (let k = 0; k < args.length; k++) {
      if (args[k] === '--root' && args[k + 1]) root = args[++k];
      else throw new AdrError([`unknown option: ${args[k]}`]);
    }
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new AdrError([`project folder not found: ${root}`]);
    }
    const blocked = checkStaged(root);
    if (!blocked) return 0;
    const files = blocked.map((p) => p.file);
    console.error([
      'ProjectMind: this commit changes files that a recorded decision protects.',
      ...blocked.map((p) => p.message),
      `If the change is intended and agreed, run \`${cliCommand()} allow ${files.map(quote).join(' ')}\` and commit again; consider updating the ADR too. \`git commit --no-verify\` skips this check.`,
    ].join('\n\n'));
    return 1;
  } catch (e) {
    const detail = e instanceof AdrError ? e.errors.join('; ') : e.message;
    console.error(`ProjectMind: pre-commit check failed, commit not checked: ${detail}`);
    return 0;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
