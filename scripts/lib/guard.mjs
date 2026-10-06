// ProjectMind guard: finds the ADRs that protect a file and writes the message to show before
// editing it. It knows no AI tool (ADR-004): each adapter in scripts/lib/adapters/ translates
// its tool's call, then the answer.

import path from 'node:path';
import { DECISIONS_DIR, readDecisions, normalizePath } from './adr.mjs';

// An ADR protects until it is explicitly inactive: better to protect too much.
// A "proposed" ADR therefore already protects. MADR statuses, then pre-v2 ones (ADR-003).
const INACTIVE_STATUSES = ['superseded', 'deprecated', 'rejected', 'remplacee', 'abandonnee', 'rejetee'];
// An ADR is itself protected: changing its status or its files would drop the protection without asking.
export const ADR_PATTERN = `${DECISIONS_DIR}/ADR-*.md`;

const simplify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Patterns relative to the project root: "*" stays within a folder, "**" crosses folders,
// and a pattern without wildcards also covers what it contains.
export function matches(pattern, filePath, caseSensitive = process.platform !== 'win32') {
  const m = normalizePath(pattern).replace(/\/+$/, '');
  if (!m) return false;
  let re = '';
  for (let k = 0; k < m.length; k++) {
    if (m.startsWith('**/', k)) { re += '(?:.*/)?'; k += 2; }
    else if (m.startsWith('**', k)) { re += '.*'; k += 1; }
    else if (m[k] === '*') re += '[^/]*';
    else if (m[k] === '?') re += '[^/]';
    else re += m[k].replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const contents = /[*?]/.test(m) ? '' : '(?:/.*)?';
  return new RegExp(`^${re}${contents}$`, caseSensitive ? '' : 'i').test(filePath);
}

// File path relative to the root, or null when it is outside the project.
export function relativePath(root, file) {
  const rel = normalizePath(path.relative(root, path.resolve(root, file)));
  if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return null;
  return rel;
}

export const isActive = (adr) => !INACTIVE_STATUSES.some((s) => simplify(adr.status ?? '').startsWith(s));

// What the project protects in this file, or null when it is free or outside the project.
// Returns { file (relative), isAdr, hits: [{ adr, patterns }], message }.
export function protections(root, file) {
  if (typeof file !== 'string' || !file) return null;
  const rel = relativePath(root, file);
  if (!rel) return null;
  const isAdr = matches(ADR_PATTERN, rel);
  const hits = readDecisions(root)
    .filter(isActive)
    .map((adr) => ({ adr, patterns: adr.protected_files.filter((p) => matches(p, rel)) }))
    .filter((h) => h.patterns.length);
  if (!isAdr && !hits.length) return null;
  return { file: rel, isAdr, hits, message: compose(rel, isAdr, hits) };
}

function compose(rel, isAdr, hits) {
  const blocks = hits.map(({ adr, patterns }) => [
    `${adr.id ?? '?'} — ${adr.title ?? '(untitled)'} [pattern: ${patterns.join(', ')}]`,
    `Reason: ${adr.reason ?? '(not given)'}`,
    ...(adr.rejected_alternatives.length ? [`Rejected alternatives: ${adr.rejected_alternatives.join('; ')}`] : []),
    ...(adr.errors.length ? [`⚠ ADR needs fixing: ${adr.errors.join('; ')}`] : []),
    `Source: ${adr.file}`,
  ].join('\n'));
  return [
    `ProjectMind: ${rel} is protected by a recorded decision.`,
    ...(isAdr ? ['This file is an ADR: editing it changes a recorded decision (its status, its protected files…). Confirm only if the decision has been reviewed.'] : []),
    ...blocks,
    ...(hits.length ? ['Confirm only if you are revisiting this decision, and then update the ADR.'] : []),
  ].join('\n\n');
}
