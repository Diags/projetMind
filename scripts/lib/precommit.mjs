// The git safety net (ADR-005): before a commit, refuse the files that a recorded decision
// protects, whoever changed them, an AI tool through its shell or a human. ADR files themselves
// may be committed: the release check lists them for review in the PR.

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AdrError } from './adr.mjs';
import { check } from './consent.mjs';

// Files the commit adds, changes, renames or deletes, relative to the root.
export function stagedFiles(root) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '-z', '--diff-filter=ACDMRT'], { cwd: root, encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new AdrError([`git diff --cached: ${(r.stderr || r.error?.message || '').trim()}`]);
  return r.stdout.split('\0').filter(Boolean);
}

// The staged files protected by an active ADR and not allowed by the user, or null.
export function checkStaged(root, now = Date.now()) {
  const result = check(root, stagedFiles(root).map((f) => path.join(root, f)), now);
  const blocked = result?.blocked.filter((p) => p.hits.length) ?? [];
  return blocked.length ? blocked : null;
}
