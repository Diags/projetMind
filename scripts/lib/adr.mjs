// Reading and writing ProjectMind ADRs: docs/decisions/ADR-NNN-<slug>.md, in a MADR-compatible
// format (ADR-003). No dependencies. The front matter is a subset of YAML (see parseFrontMatter):
// the script always quotes strings; a human may remove the quotes.

import fs from 'node:fs';
import path from 'node:path';

export const DECISIONS_DIR = 'docs/decisions';
const FILE_NAME = /^ADR-(\d+)-.+\.md$/i;
const TEXT_FIELDS = ['title', 'reason', 'context', 'options', 'decision', 'consequences'];
const LIST_FIELDS = ['protected_files', 'rejected_alternatives'];
const REQUIRED = ['title', 'reason', 'context', 'decision'];
// Keys used before v2: ADRs written with them are still read, and create() still accepts them (ADR-003).
const LEGACY_KEYS = {
  titre: 'title', statut: 'status', raison: 'reason', contexte: 'context',
  fichiers_proteges: 'protected_files', alternatives_rejetees: 'rejected_alternatives',
};
const canonical = (key) => (Object.hasOwn(LEGACY_KEYS, key) ? LEGACY_KEYS[key] : key);

export class AdrError extends Error {
  constructor(errors) {
    super(errors.join('\n'));
    this.errors = errors;
  }
}

export function slugify(title, max = 60) {
  const base = title
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base || 'decision';
  // Cut at the last hyphen before the limit, so that no word is truncated.
  const cut = base.slice(0, max + 1);
  const hyphen = cut.lastIndexOf('-');
  return hyphen > 0 ? cut.slice(0, hyphen) : base.slice(0, max);
}

export function numberOf(name) {
  const m = FILE_NAME.exec(name);
  return m ? Number(m[1]) : null;
}

// One more than the highest number: a gap in the sequence is never reused.
export function nextNumber(names) {
  let max = 0;
  for (const name of names) {
    const n = numberOf(name);
    if (n !== null && n > max) max = n;
  }
  return max + 1;
}

export function formatId(n) {
  return `ADR-${String(n).padStart(3, '0')}`;
}

export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Path relative to the project root, with "/" separators and no leading "./".
export function normalizePath(p) {
  return p.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

function prepare(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['input must be a JSON object'] };
  }
  const errors = [];
  const adr = {};
  const values = {};
  for (const key of Object.keys(input)) {
    const field = canonical(key);
    if (!TEXT_FIELDS.includes(field) && !LIST_FIELDS.includes(field)) errors.push(`unknown key: "${key}"`);
    else if (Object.hasOwn(values, field)) errors.push(`"${field}" given twice, in English and in French`);
    else values[field] = input[key];
  }
  for (const field of TEXT_FIELDS) {
    const v = values[field] ?? '';
    if (typeof v !== 'string') errors.push(`"${field}" must be a string`);
    adr[field] = typeof v === 'string' ? v.trim() : '';
    if (REQUIRED.includes(field) && !adr[field] && typeof v === 'string') errors.push(`"${field}" is required`);
  }
  if (/[\r\n]/.test(adr.title)) errors.push('"title" must fit on one line');
  for (const field of LIST_FIELDS) {
    const v = values[field] ?? [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) {
      errors.push(`"${field}" must be a list of non-empty strings`);
      adr[field] = [];
    } else {
      adr[field] = v.map((x) => x.trim());
    }
  }
  adr.protected_files = [...new Set(adr.protected_files.map(normalizePath))];
  for (const f of adr.protected_files) {
    if (path.posix.isAbsolute(f) || /^[A-Za-z]:/.test(f) || f.split('/').includes('..')) {
      errors.push(`path outside the project: "${f}" (give a path relative to the project root)`);
    }
  }
  return { adr, errors };
}

// MADR 4 front matter and sections; id, title, protected_files, reason and rejected_alternatives
// are ProjectMind's own. Empty optional sections are left out, as MADR allows.
export function serialize(id, adr, date) {
  const q = (s) => JSON.stringify(s);
  const list = (key, values) => (values.length ? [`${key}:`, ...values.map((v) => `  - ${q(v)}`)] : [`${key}: []`]);
  const section = (heading, text) => (text ? [heading, '', text, ''] : []);
  return [
    '---',
    `id: ${id}`,
    `title: ${q(adr.title)}`,
    'status: accepted',
    `date: ${date}`,
    ...list('protected_files', adr.protected_files),
    `reason: ${q(adr.reason)}`,
    ...list('rejected_alternatives', adr.rejected_alternatives),
    '---',
    '',
    `# ${id} — ${adr.title}`,
    '',
    ...section('## Context and Problem Statement', adr.context),
    ...section('## Considered Options', adr.options),
    ...section('## Decision Outcome', adr.decision),
    ...section('### Consequences', adr.consequences),
  ].join('\n');
}

// Computes the number, writes the file (unless dryRun) and returns { id, file, content }.
export function create(root, input, { dryRun = false, date = today() } = {}) {
  const { adr, errors } = prepare(input);
  if (errors.length) throw new AdrError(errors);
  const dir = path.join(root, DECISIONS_DIR);
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const id = formatId(nextNumber(names));
  const name = `${id}-${slugify(adr.title)}.md`;
  const content = serialize(id, adr, date);
  if (!dryRun) {
    fs.mkdirSync(dir, { recursive: true });
    try {
      fs.writeFileSync(path.join(dir, name), content, { flag: 'wx' });
    } catch (e) {
      if (e.code === 'EEXIST') throw new AdrError([`file already exists: ${DECISIONS_DIR}/${name}`]);
      throw e;
    }
  }
  return { id, file: `${DECISIONS_DIR}/${name}`, content };
}

// Subset of YAML read in the front matter:
//   key: value             bare text, "double-quoted" or 'single-quoted'
//   key: more              bare text may go on over the following indented lines
//   key: [a, "b"]          one-line list
//   key:                   dash list, indented or not
//     - a
//   key: >   or   key: |   folded or literal block
//   # comment
// Returns { data, errors }; data is null when there is no front matter.
export function parseFrontMatter(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0].trim() !== '---') return { data: null, errors: ['no front matter: the first line must be ---'] };
  const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
  if (end < 0) return { data: null, errors: ['front matter not closed: the closing --- line is missing'] };

  const data = {};
  const errors = [];
  let i = 1;
  while (i < end) {
    if (isBlank(lines[i])) { i++; continue; }
    const m = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*?))?\s*$/.exec(lines[i]);
    if (!m) {
      errors.push(`line ${i + 1} unreadable: ${lines[i].trim()}`);
      i++;
      continue;
    }
    const [, key, value = ''] = m;
    i++;
    const rest = [];
    while (i < end && (/^\s/.test(lines[i]) || lines[i] === '' || (value === '' && /^-(\s|$)/.test(lines[i])))) {
      rest.push(lines[i]);
      i++;
    }
    const useful = rest.filter((l) => !isBlank(l));
    if (/^[|>][+-]?$/.test(value)) {
      data[key] = readBlock(value[0], rest);
    } else if (value === '') {
      data[key] = useful.length && /^-(\s|$)/.test(useful[0].trim())
        ? readList(useful)
        : readScalar(useful.map((l) => l.trim()).join(' '));
    } else {
      const raw = [value, ...useful.map((l) => l.trim())].join(' ');
      data[key] = raw.startsWith('[') ? readInlineList(raw, errors, key) : readScalar(raw);
    }
  }
  return { data, errors };
}

function isBlank(line) {
  return /^\s*(#.*)?$/.test(line);
}

function readScalar(raw) {
  const s = raw.trim();
  if (s.startsWith('"')) {
    let k = 1;
    while (k < s.length && s[k] !== '"') k += s[k] === '\\' ? 2 : 1;
    try {
      return JSON.parse(s.slice(0, k + 1));
    } catch {
      return s.slice(1, k);
    }
  }
  if (s.startsWith("'")) {
    let out = '';
    for (let k = 1; k < s.length; k++) {
      if (s[k] !== "'") out += s[k];
      else if (s[k + 1] === "'") { out += "'"; k++; }
      else break;
    }
    return out;
  }
  return s.replace(/\s+#.*$/, '');
}

function readList(lines) {
  const items = [];
  for (const l of lines) {
    const t = l.trim();
    if (/^-(\s|$)/.test(t)) items.push(t.slice(1).trim());
    else items[items.length - 1] += ` ${t}`;
  }
  return items.map(readScalar);
}

function readInlineList(raw, errors, key) {
  const items = [];
  let current = '';
  let quote = null;
  let k = 1;
  for (; k < raw.length; k++) {
    const c = raw[k];
    if (quote) {
      current += c;
      if (c === '\\' && quote === '"') current += raw[++k] ?? '';
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      current += c;
    } else if (c === ',') {
      items.push(current);
      current = '';
    } else if (c === ']') {
      break;
    } else {
      current += c;
    }
  }
  if (k >= raw.length) errors.push(`"${key}": list not closed`);
  items.push(current);
  return items.map((e) => e.trim()).filter((e) => e !== '').map(readScalar);
}

function readBlock(type, rest) {
  const lines = [...rest];
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length));
  const text = lines.map((l) => l.slice(indent));
  if (type === '|') return text.join('\n');
  return text.join('\n').split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).join(' ')).join('\n');
}

// Pre-v2 front matter keys → current keys. keyRead keeps each key as written in the file,
// so that messages quote it as is.
function fromLegacy(data, errors) {
  const d = { ...data };
  const keyRead = {};
  for (const key of Object.keys(d)) keyRead[key] = key;
  for (const [legacy, field] of Object.entries(LEGACY_KEYS)) {
    if (!Object.hasOwn(d, legacy)) continue;
    if (Object.hasOwn(d, field)) {
      errors.push(`"${field}" and "${legacy}" are the same field: "${field}" is kept`);
    } else {
      d[field] = d[legacy];
      keyRead[field] = legacy;
    }
    delete d[legacy];
  }
  return { d, keyRead };
}

// Reads all project ADRs, sorted by number. An anomaly is reported in "errors" without
// dropping the decision: better to protect too much.
export function readDecisions(root) {
  const dir = path.join(root, DECISIONS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => FILE_NAME.test(name))
    .sort((a, b) => numberOf(a) - numberOf(b))
    .map((name) => {
      const { data, errors } = parseFrontMatter(fs.readFileSync(path.join(dir, name), 'utf8'));
      const { d, keyRead } = fromLegacy(data ?? {}, errors);
      for (const field of LIST_FIELDS) {
        if (d[field] === undefined || d[field] === '') d[field] = [];
        else if (!Array.isArray(d[field])) {
          errors.push(`"${keyRead[field]}" should be a list`);
          d[field] = [d[field]];
        }
      }
      d.protected_files = d.protected_files.map(normalizePath);
      if (data && !d.reason) errors.push(`"${keyRead.reason ?? 'reason'}" is missing`);
      const expected = formatId(numberOf(name));
      if (data && d.id !== expected) errors.push(`"id" is ${d.id ?? '(none)'} but the file name gives ${expected}`);
      return { file: `${DECISIONS_DIR}/${name}`, ...d, errors };
    });
}
