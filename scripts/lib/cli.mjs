// Helpers shared by the command-line scripts in scripts/ and by bin/projectmind.mjs.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AdrError } from './adr.mjs';

// The npm package, as package.json names it. npm refused the plain name "projectmind" as too
// close to "project-mind", so the package is scoped; its command is still "projectmind".
export const PACKAGE = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
// How generated files run ProjectMind: the published package, pinned to this version.
export const NPX = `npx --yes ${PACKAGE.name}@${PACKAGE.version}`;

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
