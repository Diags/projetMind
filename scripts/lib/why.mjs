// /projectmind:why: what the project knows about a file, each item with its source.
// Reads the ADRs, every .md file tracked by git (existing registers, without declaring them)
// and the last commits that touch the file. Changes nothing.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AdrError, readDecisions } from './adr.mjs';
import { ADR_PATTERN, relativePath, matches, isActive } from './guard.mjs';

const MAX_COMMITS = 5;
// From most to least reliable: a line that cites the file in several ways keeps the most reliable.
const RANKS = ['path', 'path suffix', 'name only'];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const excerpt = (line, max = 200) => {
  const t = line.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function git(root, args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function trackedFiles(root) {
  try {
    return git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

// How a line cites the file: its path, an ending of its path (auth/name.ts), or its name alone
// when no other file in the repository has it. null when the line does not cite it.
// A path that ends with the same name but leads elsewhere (config/name.ts) does not count.
export function mention(line, rel, uniqueName) {
  const name = path.posix.basename(rel);
  const re = new RegExp(`(?<![\\w./-])[\\w./-]*?${escapeRegExp(name)}(?![\\w-]|\\.\\w)`, 'g');
  let best = null;
  for (const [token] of line.matchAll(re)) {
    const cited = token.replace(/^(\.\/)+/, '');
    let type = null;
    if (cited === rel) type = 'path';
    else if (cited.includes('/') && rel.endsWith(`/${cited}`)) type = 'path suffix';
    else if (cited === name && uniqueName) type = 'name only';
    if (type && (best === null || RANKS.indexOf(type) < RANKS.indexOf(best))) best = type;
  }
  return best;
}

// Index of the --- line that closes the front matter, or -1 when there is none.
function frontMatterEnd(lines) {
  if (lines[0]?.trim() !== '---') return -1;
  return lines.findIndex((l, k) => k > 0 && l.trim() === '---');
}

export function why(root, file) {
  const rel = relativePath(root, file);
  if (!rel) throw new AdrError([`file outside the project: ${file}`]);
  const warnings = [];
  const tracked = trackedFiles(root);
  if (!tracked) warnings.push('not a git repository: only ADRs are read, without history.');
  const exists = fs.existsSync(path.join(root, rel));
  if (!exists) warnings.push(`${rel} not found on disk; searching anyway.`);

  const name = path.posix.basename(rel);
  const namesakes = (tracked ?? []).filter((f) => f !== rel && path.posix.basename(f) === name).length;

  // ADRs are read even when git does not track them yet.
  const adrs = readDecisions(root);
  const toRead = [...new Set([...(tracked ?? []).filter((f) => /\.md$/i.test(f)), ...adrs.map((a) => a.file)])]
    .filter((f) => f !== rel);
  const mentions = [];
  for (const f of toRead) {
    const full = path.join(root, f);
    if (!fs.existsSync(full)) continue;
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    // In an ADR, the front matter is already shown through "patterns": only the body is read.
    const start = matches(ADR_PATTERN, f) ? frontMatterEnd(lines) + 1 : 0;
    for (let k = start; k < lines.length; k++) {
      const by = mention(lines[k], rel, namesakes === 0);
      if (by) mentions.push({ file: f, line: k + 1, by, text: excerpt(lines[k]) });
    }
  }

  const decisions = adrs
    .map((adr) => ({
      id: adr.id,
      title: adr.title,
      status: adr.status,
      active: isActive(adr),
      file: adr.file,
      reason: adr.reason,
      patterns: adr.protected_files.filter((p) => matches(p, rel)),
      citations: mentions.filter((m) => m.file === adr.file),
    }))
    .filter((d) => d.patterns.length || d.citations.length);

  let history = null;
  if (tracked) {
    try {
      history = git(root, ['log', `-n${MAX_COMMITS}`, '--follow', '--date=short', '--format=%h%x09%ad%x09%s', '--', rel])
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [hash, date, ...subject] = l.split('\t');
          return { hash, date, subject: subject.join('\t') };
        });
    } catch {
      warnings.push('git history unreadable.');
      history = [];
    }
  }

  return {
    file: rel,
    exists,
    namesakes,
    decisions,
    documentation: mentions.filter((m) => !matches(ADR_PATTERN, m.file)),
    history,
    warnings,
  };
}

export function format(r) {
  const s = [`Why ${r.file}?`, '', 'Decisions (ADRs)'];
  if (!r.decisions.length) s.push('- No ADR protects or cites this file.');
  for (const d of r.decisions) {
    const state = d.active ? '' : ` (status: ${d.status} — no longer protects)`;
    s.push(`- ${d.id} "${d.title}"${state} — ${d.file}`);
    if (d.patterns.length) s.push(`  Protects this file (pattern: ${d.patterns.join(', ')})`);
    if (d.reason) s.push(`  Reason: ${d.reason}`);
    for (const c of d.citations) s.push(`  Cited on line ${c.line} [${c.by}]: ${c.text}`);
  }
  s.push('', 'Mentions in the documentation (.md files tracked by git)');
  if (!r.documentation.length) s.push('- No mention found.');
  for (const m of r.documentation) s.push(`- ${m.file}:${m.line} [${m.by}] ${m.text}`);
  if (r.namesakes) {
    const name = path.posix.basename(r.file);
    s.push(`- Name alone not searched: ${r.namesakes} other file(s) are named ${name}.`);
  }
  if (r.history) {
    s.push('', `Git history (last ${MAX_COMMITS} commits at most)`);
    if (!r.history.length) s.push('- No commit touches this file.');
    for (const c of r.history) s.push(`- ${c.hash} ${c.date} ${c.subject}`);
  }
  if (r.warnings.length) s.push('', ...r.warnings.map((w) => `⚠ ${w}`));
  return `${s.join('\n')}\n`;
}
