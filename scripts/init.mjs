#!/usr/bin/env node
// `projectmind init` and `projectmind uninstall`: set ProjectMind up for the project's AI tools,
// or remove what init wrote.
//   node init.mjs init [--tools <list>|all] [--dry-run] [--root <dir>] [--source <npm spec>]
//   node init.mjs uninstall [--dry-run] [--root <dir>]

import fs from 'node:fs';
import { AdrError } from './lib/adr.mjs';
import { handleError, isMain } from './lib/cli.mjs';
import { AI_TOOLS, TOOLS, actionOf, apply, detectTools, isGitRoot, planInit, planUninstall } from './lib/init.mjs';

const NEXT_STEPS = {
  'claude-code': 'Claude Code: trust the folder when you open it; the projectmind plugin is then offered from its catalog.',
  codex: 'Codex: review and trust the new project hooks with /hooks (Codex skips them until then).',
  cursor: 'Cursor: hooks run in trusted workspaces only.',
  copilot: 'Copilot: the CLI and the cloud agent read .github/hooks/ from the repository.',
  gemini: 'Gemini CLI: the new project hook shows a warning the first time it runs.',
  git: 'git: the pre-commit hook stays in this clone; each teammate runs init for it.',
};

function readOptions(args, name) {
  const options = { root: process.cwd(), dryRun: false, tools: null, source: null };
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--dry-run') options.dryRun = true;
    else if (args[k] === '--root' && args[k + 1]) options.root = args[++k];
    else if (name === 'init' && args[k] === '--tools' && args[k + 1]) options.tools = args[++k];
    else if (name === 'init' && args[k] === '--source' && args[k + 1]) options.source = args[++k];
    else throw new AdrError([`unknown option: ${args[k]}`]);
  }
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    throw new AdrError([`project folder not found: ${options.root}`]);
  }
  return options;
}

function chooseTools(root, wanted) {
  if (wanted === null) return detectTools(root);
  if (wanted === 'all') return [...AI_TOOLS, ...(isGitRoot(root) ? ['git'] : [])];
  const tools = wanted.split(',').map((t) => t.trim()).filter(Boolean);
  const unknown = tools.filter((t) => !TOOLS.includes(t));
  if (unknown.length) throw new AdrError([`unknown tool: ${unknown.join(', ')} (known: ${TOOLS.join(', ')}, or all)`]);
  return tools;
}

function show(changes, dryRun) {
  const done = changes.filter((c) => actionOf(c) !== 'unchanged');
  for (const c of done) console.log(`${dryRun ? 'would ' : ''}${actionOf(c)} ${c.file}`);
  if (!done.length) console.log('nothing to do');
  return done.length;
}

// Returns the exit code: 0, 1 on an error or when there is nothing to set up, 2 on a usage error.
export function run(args, prefix = 'node init.mjs') {
  try {
    const [command, ...rest] = args;
    if (command === 'init') {
      const options = readOptions(rest, 'init');
      const tools = chooseTools(options.root, options.tools);
      if (!tools.length) {
        console.error(`No AI tool detected in this project. Name them: --tools ${TOOLS.join(',')} (or --tools all).`);
        return 1;
      }
      console.log(`${options.dryRun ? 'Dry run, nothing is written. ' : ''}Tools: ${tools.join(', ')}`);
      const notes = [];
      const changes = planInit(options.root, tools, { source: options.source, notes });
      const count = show(changes, options.dryRun);
      for (const note of notes) console.log(`left to you: ${note}`);
      if (options.dryRun) return 0;
      apply(options.root, changes);
      if (count) {
        console.log('\nNext steps:');
        for (const t of tools) console.log(`- ${NEXT_STEPS[t]}`);
        console.log('- Commit these files so that the whole team gets the same setup.');
      }
      return 0;
    }
    if (command === 'uninstall') {
      const options = readOptions(rest, 'uninstall');
      const changes = planUninstall(options.root);
      if (options.dryRun) console.log('Dry run, nothing is removed.');
      show(changes, options.dryRun);
      if (!options.dryRun) apply(options.root, changes, { pruneFolders: true });
      return 0;
    }
    console.error(`Usage:
  ${prefix} init [--tools <${TOOLS.join(',')}>|all] [--dry-run] [--root <dir>] [--source <npm spec>]
  ${prefix} uninstall [--dry-run] [--root <dir>]`);
    return 2;
  } catch (e) {
    return handleError(e, 1);
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
