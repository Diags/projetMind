// What the adapters of the guard share: finding the project root and the files a tool call
// is about to write, and telling the agent how to get the user's consent.

import fs from 'node:fs';
import path from 'node:path';
import { NPX } from '../cli.mjs';
import { DEFAULT_MINUTES } from '../consent.mjs';

// Argument names that hold a file path, across the tools' editing tools.
const PATH_KEYS = ['file_path', 'path', 'filePath', 'filename', 'target_file', 'targetFile', 'notebook_path'];

// Files named in a Codex apply_patch text. Grammar: codex-rs/apply-patch/src/parser.rs
// ("*** Add File: ", "*** Delete File: ", "*** Update File: ", "*** Move to: "), which also
// accepts whitespace around the markers and a heredoc around the patch.
export function patchPaths(text) {
  const files = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*\*\*\* (?:Add File|Delete File|Update File|Move to): (.+?)\s*$/.exec(line);
    if (m) files.push(m[1]);
  }
  return files;
}

// Every file path found in a tool's arguments: the usual path fields, lists of paths, and the
// files of any patch text. Arguments may come as a JSON string.
export function pathsIn(args) {
  let value = args;
  if (typeof value === 'string') {
    if (value.includes('*** Begin Patch')) return patchPaths(value);
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== 'object') return [];
  const files = [];
  for (const key of PATH_KEYS) if (typeof value[key] === 'string' && value[key]) files.push(value[key]);
  for (const key of ['paths', 'files']) {
    if (Array.isArray(value[key])) files.push(...value[key].filter((f) => typeof f === 'string' && f));
  }
  for (const v of Object.values(value)) if (typeof v === 'string' && v.includes('*** Begin Patch')) files.push(...patchPaths(v));
  return files;
}

// The nearest folder, from start upwards, that holds docs/decisions/ or .git; start itself otherwise.
export function findRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'docs', 'decisions')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

const quote = (f) => (/[\s"'$`]/.test(f) ? JSON.stringify(f) : f);

// Appended to the reason when the tool cannot ask the user itself.
export function consentInstruction(tool, files) {
  return [
    `${tool} cannot ask the user before this edit, so ProjectMind blocked it.`,
    'Ask the user in the chat whether to go ahead. Only if they agree, run',
    `\`${NPX} allow ${files.map(quote).join(' ')}\` and retry the edit;`,
    `the permission lasts ${DEFAULT_MINUTES} minutes.`,
  ].join(' ');
}
