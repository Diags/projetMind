// /projectmind:release-check: ✓/⚠/✗ report on a branch before release.
// Runs the project's check command, looks at the ADRs the branch touches and searches for
// secrets in what it adds. Fixes nothing, never fetches, never shows a secret's value:
// only its file, line and type.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AdrError, readDecisions, numberOf } from './adr.mjs';
import { ADR_PATTERN, matches, isActive } from './guard.mjs';

// Setting committed with the project. The old location is still read for projects set up before v2 (ADR-004).
export const CONFIG_FILE = '.projectmind.json';
export const LEGACY_CONFIG_FILE = '.claude/projectmind.json';
const CONFIG_KEYS = ['check', 'base'];
// Key name used before v2, still read.
const LEGACY_CONFIG_KEYS = { controle: 'check' };
export const OK = '✓';
export const WARN = '⚠';
export const FAIL = '✗';
const VERDICTS = { [OK]: 'Ready', [WARN]: 'Ready with reservations', [FAIL]: 'Not ready' };

// Fallback patterns when gitleaks is missing: few, and aimed at precise formats.
const SECRET_PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS key', /\b(?:AKIA|ASIA)[A-Z2-7]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['sk- API key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ['Google key', /\bAIza[0-9A-Za-z_-]{35}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
// Files that should never be committed; templates (.env.example…) are allowed.
const SENSITIVE_FILE = /(^|\/)(\.env(\.(?!(example|sample|template|dist)$)[^/]+)?|id_rsa|id_ecdsa|id_ed25519|[^/]+\.(pem|key|p12|pfx|jks))$/i;

function git(root, args) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new AdrError([`git ${args.join(' ')}: ${(r.stderr || r.error?.message || '').trim()}`]);
  return r.stdout;
}

const exists = (root, ref) => spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root }).status === 0;

function defaultBase(root) {
  const r = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: root, encoding: 'utf8' });
  return [r.status === 0 ? r.stdout.trim() : null, 'main', 'master'].filter(Boolean).find((ref) => exists(root, ref)) ?? null;
}

// Returns { config, errors, file }; file is null when the project has no setting.
export function readConfig(root) {
  const present = [CONFIG_FILE, LEGACY_CONFIG_FILE].filter((f) => fs.existsSync(path.join(root, f)));
  if (!present.length) return { config: {}, errors: [], file: null };
  const [file] = present;
  const errors = present.length > 1 ? [`${LEGACY_CONFIG_FILE} ignored: ${CONFIG_FILE} takes precedence`] : [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    return { config: {}, errors: [...errors, `${file} unreadable: ${e.message}`], file };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: {}, errors: [...errors, `${file} must contain a JSON object`], file };
  }
  const config = {};
  const isLegacy = (key) => Object.hasOwn(LEGACY_CONFIG_KEYS, key);
  // Current keys first, so that they win over their pre-v2 name.
  const entries = Object.entries(raw).sort(([a], [b]) => isLegacy(a) - isLegacy(b));
  for (const [key, value] of entries) {
    const name = isLegacy(key) ? LEGACY_CONFIG_KEYS[key] : key;
    if (!CONFIG_KEYS.includes(name)) errors.push(`${file}: unknown key "${key}"`);
    else if (Object.hasOwn(config, name)) errors.push(`${file}: "${name}" and "${key}" are the same setting: "${name}" is kept`);
    else if (typeof value !== 'string') errors.push(`${file}: "${key}" must be a string`);
    else config[name] = value;
  }
  return { config, errors, file };
}

// The project's usual test command, for a project that declares none (plug and play): from
// package.json, Cargo.toml, go.mod, the pytest settings or a "test" target in the Makefile, in
// that order. Returns { command, from } or null.
export function detectCheck(root) {
  const read = (f) => {
    try {
      return fs.readFileSync(path.join(root, f), 'utf8').replace(/^﻿/, '');
    } catch {
      return null;
    }
  };
  const has = (f) => fs.existsSync(path.join(root, f));
  let pkg = null;
  try {
    pkg = JSON.parse(read('package.json') ?? 'null');
  } catch {
    pkg = null;
  }
  const test = pkg?.scripts?.test;
  // npm init writes a test script that only fails: it is not a check.
  if (typeof test === 'string' && test.trim() && !test.includes('no test specified')) {
    const runner = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lock') || has('bun.lockb') ? 'bun run' : 'npm';
    return { command: `${runner} test`, from: 'package.json' };
  }
  if (has('Cargo.toml')) return { command: 'cargo test', from: 'Cargo.toml' };
  if (has('go.mod')) return { command: 'go test ./...', from: 'go.mod' };
  if (has('pytest.ini')) return { command: 'pytest', from: 'pytest.ini' };
  if (/^\[tool\.pytest\.ini_options\]/m.test(read('pyproject.toml') ?? '')) return { command: 'pytest', from: 'pyproject.toml' };
  if (/^test\s*:/m.test(read('Makefile') ?? '')) return { command: 'make test', from: 'Makefile' };
  return null;
}

// Files changed between the merge base and HEAD: [{ status: A|M|D|T, file }].
function readChanges(root, base) {
  const fields = git(root, ['diff', '--name-status', '--no-renames', '-z', base, 'HEAD']).split('\0').filter(Boolean);
  const changes = [];
  for (let k = 0; k + 1 < fields.length; k += 2) changes.push({ status: fields[k][0], file: fields[k + 1] });
  return changes;
}

function checkSection(root, command, noCheck, detectedFrom) {
  const title = 'Check command';
  if (noCheck) return { title, state: WARN, lines: ['not run (--no-check)'] };
  if (!command) return { title, state: WARN, lines: [`no check command declared or detected: add "check" to ${CONFIG_FILE}`] };
  const origin = detectedFrom ? { detectedFrom } : {};
  const note = detectedFrom ? [`command detected from ${detectedFrom}: declare "check" in ${CONFIG_FILE} to change it`] : [];
  const start = Date.now();
  const r = spawnSync('bash', ['-c', `{ ${command}\n} 2>&1`], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const seconds = Math.round((Date.now() - start) / 1000);
  if (r.error) return { title, state: FAIL, ...origin, lines: [...note, `${command}: could not start (${r.error.message})`] };
  const output = (r.stdout ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const log = path.join(os.tmpdir(), `projectmind-check-${Date.now()}.log`);
  fs.writeFileSync(log, output);
  const state = r.status === 0 ? OK : FAIL;
  const tail = output.trimEnd().split(/\r?\n/).slice(state === OK ? -8 : -20);
  return {
    title,
    state,
    ...origin,
    log,
    lines: [...note, `${command} → exit ${r.status ?? r.signal}, ${seconds} s`, `full log: ${log}`, ...tail.map((l) => `│ ${l}`)],
  };
}

function adrSection(root, changes, tracked) {
  const adrs = readDecisions(root);
  const active = adrs.filter(isActive);
  const lines = [];
  let state = OK;
  const warn = (line) => {
    state = WARN;
    lines.push(line);
  };
  for (const { status, file } of changes) {
    if (matches(ADR_PATTERN, file)) {
      if (status === 'A') lines.push(`ADR added: ${file}`);
      else warn(`ADR ${status === 'D' ? 'deleted' : 'modified'} on the branch: ${file} — review it in the PR`);
      continue;
    }
    for (const adr of active) {
      const patterns = adr.protected_files.filter((p) => matches(p, file));
      if (patterns.length) warn(`${file} ${status === 'D' ? 'deleted' : 'touched'} — protected by ${adr.id} "${adr.title}" (pattern: ${patterns.join(', ')})`);
    }
  }
  for (const adr of adrs) {
    for (const e of adr.errors) warn(`${adr.file}: ${e}`);
  }
  for (const adr of active) {
    for (const p of adr.protected_files) {
      if (!tracked.some((f) => matches(p, f))) warn(`${adr.id}: pattern "${p}" matches no tracked file`);
    }
  }
  const byNumber = new Map();
  for (const adr of adrs) {
    const n = numberOf(path.posix.basename(adr.file));
    byNumber.set(n, [...(byNumber.get(n) ?? []), adr.file]);
  }
  for (const [, files] of byNumber) {
    if (files.length > 1) warn(`same number for several ADRs: ${files.join(', ')}`);
  }
  if (state === OK) {
    lines.unshift(adrs.length ? `${adrs.length} ADR(s) read: no protected file touched, no anomaly` : 'no ADR in docs/decisions/: nothing to check');
  }
  return { title: 'Decisions (ADRs)', state, lines };
}

const gitleaksVersion = () => {
  const r = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

function secretsFromGitleaks(root, base) {
  const report = path.join(os.tmpdir(), `projectmind-gitleaks-${Date.now()}.json`);
  const r = spawnSync('gitleaks', [
    'git', '--no-banner', '--redact', '--exit-code', '0',
    '--report-format', 'json', '--report-path', report, `--log-opts=${base}..HEAD`, root,
  ], { encoding: 'utf8' });
  try {
    if (r.status !== 0) throw new AdrError([`gitleaks failed (exit ${r.status}): ${(r.stderr ?? '').trim().split('\n').pop()}`]);
    return JSON.parse(fs.readFileSync(report, 'utf8')).map((f) => ({
      file: f.File, line: f.StartLine, type: f.RuleID, commit: f.Commit?.slice(0, 7),
    }));
  } finally {
    fs.rmSync(report, { force: true });
  }
}

// Added lines of the diff, with their number in the HEAD version.
function secretsFromPatterns(root, base) {
  const found = [];
  let file = null;
  let line = 0;
  for (const l of git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', base, 'HEAD']).split('\n')) {
    if (l.startsWith('+++ ')) {
      file = l.startsWith('+++ b/') ? l.slice(6) : null;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (l.startsWith('+') && file) {
      for (const [type, re] of SECRET_PATTERNS) if (re.test(l)) found.push({ file, line, type });
      line++;
    }
  }
  return found;
}

function secretsSection(root, base, changes, useGitleaks) {
  const title = 'Secrets (what the branch adds)';
  const version = useGitleaks ? gitleaksVersion() : null;
  const tool = version ? `gitleaks ${version}` : `built-in patterns (${SECRET_PATTERNS.length} types, partial coverage: gitleaks not installed)`;
  const found = version ? secretsFromGitleaks(root, base) : secretsFromPatterns(root, base);
  const sensitive = changes.filter((c) => c.status !== 'D' && SENSITIVE_FILE.test(c.file));
  if (!found.length && !sensitive.length) return { title, state: OK, lines: [`no secret found — ${tool}`] };
  return {
    title,
    state: FAIL,
    lines: [
      `${found.length + sensitive.length} alert(s) — ${tool}. Values masked: do not open these lines to read them.`,
      ...sensitive.map((s) => `${s.file} — sensitive file committed by the branch`),
      ...found.map((f) => `${f.file}:${f.line} — ${f.type}${f.commit ? ` (commit ${f.commit})` : ''}`),
    ],
  };
}

function worktreeSection(root) {
  const title = 'Uncommitted changes';
  const n = git(root, ['status', '--porcelain']).split('\n').filter(Boolean).length;
  if (!n) return { title, state: OK, lines: ['none'] };
  return { title, state: WARN, lines: [`${n} file(s): the check command sees them, the ADR and secret checks do not`] };
}

export function releaseCheck(root, { base, check, noCheck = false, gitleaks = true } = {}) {
  if (spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root }).status !== 0) {
    throw new AdrError([`not a git repository: ${root}`]);
  }
  const { config, errors } = readConfig(root);
  const ref = base ?? config.base ?? defaultBase(root);
  if (!ref) throw new AdrError(['no base found (no origin/HEAD, main or master): pass --base <ref>']);
  if (!exists(root, ref)) throw new AdrError([`base not found: ${ref}`]);
  const mergeBase = git(root, ['merge-base', 'HEAD', ref]).trim();
  const changes = readChanges(root, mergeBase);
  const tracked = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  // The worktree state is taken before the check command, which may create files.
  const worktree = worktreeSection(root);
  const declared = check ?? config.check;
  const detected = declared || noCheck ? null : detectCheck(root);
  // The id stays stable when titles change: tests and the JSON output read it.
  const sections = [
    ...(errors.length ? [{ id: 'config', title: 'Configuration', state: WARN, lines: errors }] : []),
    { id: 'check', ...checkSection(root, declared ?? detected?.command, noCheck, detected?.from) },
    { id: 'adr', ...adrSection(root, changes, tracked) },
    { id: 'secrets', ...secretsSection(root, mergeBase, changes, gitleaks) },
    { id: 'worktree', ...worktree },
  ];
  const states = sections.map((s) => s.state);
  return {
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
    head: git(root, ['rev-parse', '--short', 'HEAD']).trim(),
    base: ref,
    mergeBase: mergeBase.slice(0, 7),
    commits: Number(git(root, ['rev-list', '--count', `${mergeBase}..HEAD`]).trim()),
    files: changes.length,
    sections,
    verdict: states.includes(FAIL) ? FAIL : states.includes(WARN) ? WARN : OK,
  };
}

export function format(r) {
  const s = [
    `Release check — ${r.branch} (${r.head}) against ${r.base} (merge base ${r.mergeBase}): ${r.commits} commit(s), ${r.files} file(s)`,
  ];
  if (!r.commits) s.push(`⚠ the branch has no commit ahead of ${r.base}: nothing to compare`);
  for (const { title, state, lines } of r.sections) s.push('', `${state} ${title}`, ...lines.map((l) => `    ${l}`));
  s.push('', `Verdict: ${r.verdict} ${VERDICTS[r.verdict]}`);
  return `${s.join('\n')}\n`;
}
