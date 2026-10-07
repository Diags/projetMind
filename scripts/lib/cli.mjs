// Helpers shared by the command-line scripts in scripts/ and by bin/projectmind.mjs.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AdrError } from './adr.mjs';

// True when this module is the script node was started with, rather than a module that
// bin/projectmind.mjs imported.
export function isMain(url) {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

// Prints an AdrError as a readable list and returns the exit code to use; rethrows anything else.
export function handleError(e, code) {
  if (!(e instanceof AdrError)) throw e;
  console.error(`Error:\n- ${e.errors.join('\n- ')}`);
  return code;
}
