// `projectmind init` and `projectmind uninstall` (ADR-004, ADR-005, ADR-006): set ProjectMind up
// for the AI tools of a project, then remove it again. Both first compute a plan, the exact list
// of files to create, update or remove, so that --dry-run can show it without writing anything.
// Existing files are completed, never replaced; every entry ProjectMind adds says "projectmind",
// which is how uninstall finds them without a manifest.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AdrError } from './adr.mjs';
import { BLOCK_END, BLOCK_START, SKILLS, agentsBlock, geminiCommand, preCommitHook, skillFile } from './templates.mjs';

const VERSION = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
export const AI_TOOLS = ['claude-code', 'codex', 'cursor', 'copilot', 'gemini'];
// "git" is the pre-commit safety net, for every tool and for humans.
export const TOOLS = [...AI_TOOLS, 'git'];
const PRE_COMMIT = '.git/hooks/pre-commit';
const MARKETPLACE = { source: { source: 'github', repo: 'Diags/projetMind' } };
const PLUGIN = 'projectmind@projectmind';
// The tools that read .agents/skills/ and AGENTS.md (Gemini CLI reads the skills only).
const SKILL_TOOLS = ['codex', 'cursor', 'copilot', 'gemini'];
const AGENTS_TOOLS = ['codex', 'cursor', 'copilot'];
// Folders that init may create; uninstall removes them when they end up empty.
const FOLDERS = ['.agents/skills', '.agents', '.codex', '.cursor', '.github/hooks', '.github', '.gemini/commands/projectmind', '.gemini/commands', '.gemini', '.claude'];

// Which tools a project already uses, from the files each one keeps in the repository.
export function detectTools(root) {
  const has = (f) => fs.existsSync(path.join(root, f));
  const found = {
    'claude-code': has('.claude') || has('CLAUDE.md'),
    codex: has('.codex'),
    cursor: has('.cursor') || has('.cursorrules'),
    copilot: has('.github/copilot-instructions.md') || has('.github/hooks') || has('.github/copilot'),
    gemini: has('.gemini') || has('GEMINI.md'),
    git: isGitRoot(root),
  };
  return TOOLS.filter((t) => found[t]);
}

// The root of a git repository with its own .git folder (not a worktree or a submodule).
export function isGitRoot(root) {
  const dotGit = path.join(root, '.git');
  return fs.existsSync(dotGit) && fs.statSync(dotGit).isDirectory();
}

const quote = (s) => (/[\s"'$`\\]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
// The command the generated files run: the published package pinned to this version, or another
// npm package spec (a tarball, a git URL…) given with --source.
export const cliCommand = (source) => (source ? `npx --yes --package ${quote(source)} projectmind` : `npx --yes projectmind@${VERSION}`);

const isOurs = (value) => /projectmind/.test(JSON.stringify(value));

function readText(root, rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function parseJson(rel, text) {
  if (text === null) return {};
  try {
    const value = JSON.parse(text.replace(/^﻿/, ''));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // reported below
  }
  throw new AdrError([`${rel} is not a JSON object: fix it, or leave this tool out with --tools`]);
}

const list = (rel, value, key) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new AdrError([`${rel}: "${key}" is not a list`]);
  return value;
};

// Drops empty objects and arrays left behind by uninstall, from the given path upwards.
function prune(obj, keys) {
  for (let k = keys.length; k > 0; k--) {
    const parent = keys.slice(0, k - 1).reduce((o, key) => o?.[key], obj);
    const value = parent?.[keys[k - 1]];
    const empty = Array.isArray(value) ? !value.length : value && typeof value === 'object' && !Object.keys(value).length;
    if (parent && empty) delete parent[keys[k - 1]];
  }
}

// One change of the plan for a JSON file: mutate gets a copy of its content. An object that ends
// up empty removes the file. A file whose content does not change keeps its formatting; one that
// changes keeps its indentation (two spaces for a new or one-line file) and its line endings.
function jsonChange(root, rel, mutate) {
  const before = readText(root, rel);
  const obj = structuredClone(parseJson(rel, before));
  mutate(obj);
  if (before !== null && JSON.stringify(obj) === JSON.stringify(parseJson(rel, before))) return { file: rel, before, after: before };
  if (!Object.keys(obj).length) return { file: rel, before, after: null };
  const indent = /\n([ \t]+)"/.exec(before ?? '')?.[1] ?? '  ';
  const eol = before?.includes('\r\n') ? '\r\n' : '\n';
  return { file: rel, before, after: `${JSON.stringify(obj, null, indent).replace(/\n/g, eol)}${eol}` };
}

const fileChange = (root, rel, after) => ({ file: rel, before: readText(root, rel), after });

// Removes a file only when ProjectMind wrote it.
const removeOurs = (root, rel) => {
  const before = readText(root, rel);
  return { file: rel, before, after: before !== null && /projectmind/.test(before) ? null : before };
};

function withoutBlock(text) {
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END);
  if (start < 0 || end < start) return text;
  const after = text.slice(end + BLOCK_END.length).replace(/^\r?\n/, '');
  return (text.slice(0, start).replace(/(\r?\n)+$/, '\n') + after).replace(/^\s+$/, '');
}

function agentsChange(root, cli) {
  const before = readText(root, 'AGENTS.md');
  const rest = withoutBlock(before ?? '');
  const after = rest.trim() ? `${rest.replace(/\s*$/, '')}\n\n${agentsBlock(cli)}` : agentsBlock(cli);
  return { file: 'AGENTS.md', before, after };
}

function agentsRemoval(root) {
  const before = readText(root, 'AGENTS.md');
  if (before === null) return { file: 'AGENTS.md', before, after: null };
  const rest = withoutBlock(before);
  return { file: 'AGENTS.md', before, after: rest === before ? before : rest.trim() ? rest : null };
}

const replaceOurs = (rel, items, key, entry) => [...list(rel, items, key).filter((e) => !isOurs(e)), entry];

// The pre-commit hook, or a note saying why init leaves it to the user: another hook manager,
// an existing hook, or no .git folder of its own.
function gitHook(root, cli) {
  const line = `${cli} check-staged`;
  if (!isGitRoot(root)) return { note: `git: not the root of a git repository with its own .git folder; add \`${line}\` to your pre-commit hook.` };
  const hooksPath = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' }).stdout?.trim();
  if (hooksPath) return { note: `git: core.hooksPath is set to ${hooksPath}; add \`${line}\` to the pre-commit hook there.` };
  const before = readText(root, PRE_COMMIT);
  if (before !== null && !/projectmind/.test(before)) return { note: `git: ${PRE_COMMIT} already exists; add \`${line}\` to it.` };
  return { change: { file: PRE_COMMIT, before, after: preCommitHook(cli), mode: 0o755 } };
}

// notes collects what init leaves to the user. cli replaces the whole command (tests).
export function planInit(root, tools, { source, cli: command, notes = [] } = {}) {
  const cli = command ?? cliCommand(source);
  const guard = (tool) => `${cli} guard ${tool}`;
  const changes = [];
  if (tools.includes('claude-code')) {
    changes.push(jsonChange(root, '.claude/settings.json', (s) => {
      s.extraKnownMarketplaces = { ...(s.extraKnownMarketplaces ?? {}), projectmind: MARKETPLACE };
      s.enabledPlugins = { ...(s.enabledPlugins ?? {}), [PLUGIN]: true };
    }));
  }
  if (tools.includes('codex')) {
    changes.push(jsonChange(root, '.codex/hooks.json', (s) => {
      s.hooks ??= {};
      s.hooks.PreToolUse = replaceOurs('.codex/hooks.json', s.hooks.PreToolUse, 'hooks.PreToolUse', {
        matcher: 'apply_patch|Edit|Write',
        hooks: [{ type: 'command', command: guard('codex'), timeout: 30, statusMessage: 'ProjectMind: checking protected files' }],
      });
    }));
  }
  if (tools.includes('cursor')) {
    changes.push(jsonChange(root, '.cursor/hooks.json', (s) => {
      s.version ??= 1;
      s.hooks ??= {};
      s.hooks.preToolUse = replaceOurs('.cursor/hooks.json', s.hooks.preToolUse, 'hooks.preToolUse', { command: guard('cursor'), matcher: 'Write|Delete' });
    }));
  }
  if (tools.includes('copilot')) {
    changes.push(fileChange(root, '.github/hooks/projectmind.json', `${JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [{ type: 'command', matcher: 'create|edit|str_replace_editor|apply_patch', bash: guard('copilot'), powershell: guard('copilot'), timeoutSec: 30 }],
      },
    }, null, 2)}\n`));
  }
  if (tools.includes('gemini')) {
    changes.push(jsonChange(root, '.gemini/settings.json', (s) => {
      s.hooks ??= {};
      s.hooks.BeforeTool = replaceOurs('.gemini/settings.json', s.hooks.BeforeTool, 'hooks.BeforeTool', {
        matcher: 'write_file|replace',
        hooks: [{ type: 'command', name: 'projectmind-guard', command: guard('gemini'), timeout: 30000, description: 'ProjectMind: stops edits to files protected by an ADR' }],
      });
    }));
    for (const name of SKILLS) changes.push(fileChange(root, `.gemini/commands/projectmind/${name}.toml`, geminiCommand(name)));
  }
  if (tools.some((t) => SKILL_TOOLS.includes(t))) {
    for (const name of SKILLS) changes.push(fileChange(root, `.agents/skills/projectmind-${name}/SKILL.md`, skillFile(name, cli)));
  }
  if (tools.some((t) => AGENTS_TOOLS.includes(t))) changes.push(agentsChange(root, cli));
  if (tools.includes('git')) {
    const { change, note } = gitHook(root, cli);
    if (change) changes.push(change);
    else notes.push(note);
  }
  return changes;
}

// Everything that init may have written, for every tool.
export function planUninstall(root) {
  const strip = (rel, keys) => jsonChange(root, rel, (s) => {
    const parent = keys.slice(0, -1).reduce((o, key) => o?.[key], s);
    const key = keys[keys.length - 1];
    if (Array.isArray(parent?.[key])) parent[key] = parent[key].filter((e) => !isOurs(e));
    prune(s, keys);
  });
  const changes = [
    jsonChange(root, '.claude/settings.json', (s) => {
      if (s.extraKnownMarketplaces) delete s.extraKnownMarketplaces.projectmind;
      if (s.enabledPlugins) delete s.enabledPlugins[PLUGIN];
      prune(s, ['extraKnownMarketplaces']);
      prune(s, ['enabledPlugins']);
    }),
    strip('.codex/hooks.json', ['hooks', 'PreToolUse']),
    jsonChange(root, '.cursor/hooks.json', (s) => {
      if (Array.isArray(s.hooks?.preToolUse)) s.hooks.preToolUse = s.hooks.preToolUse.filter((e) => !isOurs(e));
      prune(s, ['hooks', 'preToolUse']);
      // init added "version"; a file with nothing else left is ours alone.
      if (Object.keys(s).length === 1 && s.version === 1) delete s.version;
    }),
    removeOurs(root, '.github/hooks/projectmind.json'),
    strip('.gemini/settings.json', ['hooks', 'BeforeTool']),
    ...SKILLS.map((name) => removeOurs(root, `.gemini/commands/projectmind/${name}.toml`)),
    ...SKILLS.map((name) => removeOurs(root, `.agents/skills/projectmind-${name}/SKILL.md`)),
    agentsRemoval(root),
    removeOurs(root, PRE_COMMIT),
  ];
  return changes.filter((c) => c.before !== null);
}

// What a change does: create, update, remove, or nothing.
export const actionOf = (c) => (c.before === c.after ? 'unchanged' : c.before === null ? 'create' : c.after === null ? 'remove' : 'update');

// Writes the plan. After an uninstall, also removes the folders that init creates when they are
// left empty; init itself never removes a folder.
export function apply(root, changes, { pruneFolders = false } = {}) {
  for (const c of changes) {
    const file = path.join(root, c.file);
    if (actionOf(c) === 'remove') fs.rmSync(file);
    else if (actionOf(c) !== 'unchanged') {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, c.after);
      if (c.mode) fs.chmodSync(file, c.mode);
    }
  }
  if (!pruneFolders) return;
  const skillDirs = SKILLS.map((name) => `.agents/skills/projectmind-${name}`);
  for (const rel of [...skillDirs, ...FOLDERS]) {
    const dir = path.join(root, rel);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory() && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
  }
}
