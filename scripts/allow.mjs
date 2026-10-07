#!/usr/bin/env node
// `projectmind allow <file>…`: records the user's consent to edit protected files, for the tools
// whose guard cannot ask (Codex, Cursor, Gemini CLI). Run it only after the user said yes.
//   node allow.mjs [--root <dir>] [--minutes <n>] <file>…

import fs from 'node:fs';
import path from 'node:path';
import { AdrError } from './lib/adr.mjs';
import { handleError, isMain } from './lib/cli.mjs';
import { allow, DEFAULT_MINUTES } from './lib/consent.mjs';
import { protections } from './lib/guard.mjs';

// Returns the exit code: 0, 1 on an error, 2 on a usage error.
export function run(args, name = 'node allow.mjs') {
  try {
    let root = process.cwd();
    let minutes = DEFAULT_MINUTES;
    const files = [];
    for (let k = 0; k < args.length; k++) {
      if (args[k] === '--root' && args[k + 1]) root = args[++k];
      else if (args[k] === '--minutes' && args[k + 1]) minutes = Number(args[++k]);
      else if (args[k].startsWith('--')) throw new AdrError([`unknown option: ${args[k]}`]);
      else files.push(args[k]);
    }
    if (!files.length || !(minutes > 0 && minutes <= 24 * 60)) {
      console.error(`Usage: ${name} [--root <dir>] [--minutes <1-1440>] <file>…`);
      return 2;
    }
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new AdrError([`project folder not found: ${root}`]);
    }
    let rels;
    try {
      rels = allow(root, files.map((f) => path.resolve(root, f)), { minutes });
    } catch (e) {
      throw new AdrError([e.message]);
    }
    for (const rel of rels) {
      const p = protections(root, rel);
      const why = p ? p.hits.map((h) => h.adr.id).join(', ') || 'an ADR file' : 'not protected';
      console.log(`Allowed for ${minutes} min: ${rel} (${why})`);
    }
    return 0;
  } catch (e) {
    return handleError(e, 1);
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
