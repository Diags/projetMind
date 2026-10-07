#!/usr/bin/env node
// ProjectMind command line, for any AI coding tool or by hand (ADR-004, ADR-006).
// The same scripts serve the Claude Code skills: each subcommand is one of them.

import fs from 'node:fs';
import { run as adr } from '../scripts/adr.mjs';
import { run as releaseCheck } from '../scripts/release-check.mjs';
import { run as why } from '../scripts/why.mjs';

const COMMANDS = {
  adr: (args) => adr(args, 'projectmind adr'),
  why: (args) => why(args, 'projectmind why'),
  'release-check': releaseCheck,
};

const USAGE = `Usage: projectmind <command> [options]

Commands:
  adr list [--root <dir>]                  the project's ADRs, as JSON
  adr create [--dry-run] [--root <dir>]    create an ADR from a JSON object on stdin
  why [--root <dir>] [--json] <file>       what the project knows about a file
  release-check [--root <dir>] [--base <ref>] [--check "<command>"] [--no-check] [--json]
                                           ✓/⚠/✗ report on the current branch

Options:
  --help       show this help
  --version    show the version`;

const version = () => JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const [command, ...args] = process.argv.slice(2);
if (command === '--version' || command === '-v') {
  console.log(version());
} else if (command === undefined || command === '--help' || command === '-h') {
  console.log(USAGE);
} else if (Object.hasOwn(COMMANDS, command)) {
  process.exitCode = COMMANDS[command](args);
} else {
  console.error(`unknown command: ${command}\n\n${USAGE}`);
  process.exitCode = 2;
}
