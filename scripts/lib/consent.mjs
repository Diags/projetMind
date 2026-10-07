// Explicit consent for the tools whose hooks cannot ask the user (Codex, Cursor, Gemini CLI):
// their guard refuses the edit and tells the agent to ask the user in the chat; once the user
// agrees, `projectmind allow <file>` lets the edit through for a few minutes (ADR-005).
// The permission lives in the system's temporary folder, never in the project.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { protections, relativePath } from './guard.mjs';

export const DEFAULT_MINUTES = 10;

// Where the permissions of one project are kept: one file per project in the temporary folder.
export const consentFile = (root) => {
  const key = path.resolve(root);
  const id = crypto.createHash('sha256').update(process.platform === 'win32' ? key.toLowerCase() : key).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `projectmind-allowed-${id}.json`);
};

function readStore(root, now) {
  try {
    const data = JSON.parse(fs.readFileSync(consentFile(root), 'utf8'));
    return Object.fromEntries(Object.entries(data).filter(([, until]) => typeof until === 'number' && until > now));
  } catch {
    return {};
  }
}

// Files (relative to the root) whose edit the user allowed and whose permission has not expired.
export const allowedFiles = (root, now = Date.now()) => new Set(Object.keys(readStore(root, now)));

// Records the user's consent for these files. Returns their paths relative to the root.
export function allow(root, files, { minutes = DEFAULT_MINUTES, now = Date.now() } = {}) {
  const data = readStore(root, now);
  const rels = [];
  for (const f of files) {
    const rel = relativePath(root, f);
    if (!rel) throw new Error(`file outside the project: ${f}`);
    data[rel] = now + minutes * 60_000;
    rels.push(rel);
  }
  fs.writeFileSync(consentFile(root), JSON.stringify(data));
  return rels;
}

// What one tool call would edit that is protected and not allowed, or null when the call may proceed.
// Returns { blocked: [protections], message }.
export function check(root, files, now = Date.now()) {
  const allowed = allowedFiles(root, now);
  const blocked = [...new Set(files)]
    .map((f) => protections(root, f))
    .filter((p) => p && !allowed.has(p.file));
  if (!blocked.length) return null;
  return { blocked, message: blocked.map((p) => p.message).join('\n\n---\n\n') };
}
