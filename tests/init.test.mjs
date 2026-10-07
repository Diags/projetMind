import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter } from '../scripts/lib/adr.mjs';
import { actionOf, AI_TOOLS, apply, cliCommand, detectTools, planInit, planUninstall, TOOLS } from '../scripts/lib/init.mjs';

const BIN = fileURLToPath(new URL('../bin/projectmind.mjs', import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const temporary = [];
after(() => temporary.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const write = (root, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const json = (root, rel) => JSON.parse(read(root, rel));
function project(files = { 'README.md': '# Project\n', 'src/a.js': 'a\n' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporary.push(root);
  for (const [rel, content] of Object.entries(files)) write(root, rel, content);
  return root;
}
// Every folder and file of the project, with a hash of each file's bytes.
function snapshot(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (e.isDirectory()) {
        out.push(`${rel}/`);
        walk(full);
      } else out.push(`${rel} ${crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex')}`);
    }
  };
  walk(root);
  return out;
}
const run = (args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
const init = (root, tools = TOOLS, options) => apply(root, planInit(root, tools, options));
const uninstall = (root) => apply(root, planUninstall(root), { pruneFolders: true });

test('detectTools: from the files each tool keeps in the repository', () => {
  assert.deepEqual(detectTools(project()), []);
  assert.deepEqual(detectTools(project({ '.github/workflows/ci.yml': '' })), [], 'a .github folder alone is not Copilot');
  assert.deepEqual(detectTools(project({
    'CLAUDE.md': '', '.codex/config.toml': '', '.cursorrules': '', '.github/copilot-instructions.md': '', 'GEMINI.md': '',
  })), AI_TOOLS);
  assert.deepEqual(detectTools(project({ '.git/HEAD': 'ref: refs/heads/main\n' })), ['git']);
  assert.deepEqual(detectTools(project({ '.git': 'gitdir: ../elsewhere\n' })), [], 'a worktree has no .git folder of its own');
});

test('init then uninstall leaves a project exactly as it was', () => {
  const root = project();
  const before = snapshot(root);
  init(root);
  assert.notDeepEqual(snapshot(root), before);
  uninstall(root);
  assert.deepEqual(snapshot(root), before);
});

test('init writes, for each tool, a hook that runs the guard of that tool, pinned to this version', () => {
  const root = project();
  init(root);
  const cli = `npx --yes projectmind@${VERSION}`;
  assert.deepEqual(json(root, '.claude/settings.json'), {
    extraKnownMarketplaces: { projectmind: { source: { source: 'github', repo: 'Diags/projetMind' } } },
    enabledPlugins: { 'projectmind@projectmind': true },
  });
  const [codex] = json(root, '.codex/hooks.json').hooks.PreToolUse;
  assert.equal(codex.matcher, 'apply_patch|Edit|Write');
  assert.equal(codex.hooks[0].command, `${cli} guard codex`);
  assert.deepEqual(json(root, '.cursor/hooks.json'), { version: 1, hooks: { preToolUse: [{ command: `${cli} guard cursor`, matcher: 'Write|Delete' }] } });
  const [copilot] = json(root, '.github/hooks/projectmind.json').hooks.preToolUse;
  assert.equal(copilot.matcher, 'create|edit|str_replace_editor|apply_patch');
  assert.equal(copilot.bash, `${cli} guard copilot`);
  assert.equal(copilot.powershell, `${cli} guard copilot`);
  const [gemini] = json(root, '.gemini/settings.json').hooks.BeforeTool;
  assert.equal(gemini.matcher, 'write_file|replace');
  assert.equal(gemini.hooks[0].command, `${cli} guard gemini`);
  for (const name of ['remember', 'why', 'release-check']) {
    assert.match(read(root, `.gemini/commands/projectmind/${name}.toml`), new RegExp(`\\.agents/skills/projectmind-${name}/SKILL\\.md`));
  }
  assert.match(read(root, 'AGENTS.md'), /^<!-- projectmind:start -->\n## Project decisions \(ProjectMind\)/);
});

test('the skills follow the Agent Skills standard and call the pinned command', () => {
  const root = project();
  init(root, ['codex']);
  for (const name of ['remember', 'why', 'release-check']) {
    const text = read(root, `.agents/skills/projectmind-${name}/SKILL.md`);
    const { data, errors } = parseFrontMatter(text);
    assert.deepEqual(errors, []);
    assert.deepEqual(Object.keys(data), ['name', 'description', 'metadata'], 'portable fields only');
    assert.equal(data.name, `projectmind-${name}`, 'the name is the folder name');
    assert.ok(data.description.length <= 1024);
    assert.match(text, new RegExp(`npx --yes projectmind@${VERSION.replace(/\./g, '\\.')} `));
  }
  assert.match(read(root, '.agents/skills/projectmind-remember/SKILL.md'), /adr create --dry-run --input/);
});

test('init completes existing files and uninstall gives their content back', () => {
  const files = {
    '.claude/settings.json': '{\n  "permissions": {\n    "allow": [\n      "Bash(npm test)"\n    ]\n  }\n}\n',
    '.cursor/hooks.json': '{\r\n\t"version": 1,\r\n\t"hooks": {\r\n\t\t"stop": [\r\n\t\t\t{\r\n\t\t\t\t"command": "./x.sh"\r\n\t\t\t}\r\n\t\t]\r\n\t}\r\n}\r\n',
    '.gemini/settings.json': '{\n  "theme": "dark"\n}\n',
    'AGENTS.md': '# Agents\n\nUse pnpm.\n',
  };
  const root = project(files);
  init(root);
  assert.deepEqual(json(root, '.claude/settings.json').permissions, { allow: ['Bash(npm test)'] });
  assert.equal(json(root, '.cursor/hooks.json').hooks.stop[0].command, './x.sh');
  assert.match(read(root, '.cursor/hooks.json'), /^\{\r\n\t"version"/, 'indentation and line endings kept');
  assert.equal(json(root, '.gemini/settings.json').theme, 'dark');
  assert.match(read(root, 'AGENTS.md'), /^# Agents\n\nUse pnpm\.\n\n<!-- projectmind:start -->/);
  uninstall(root);
  for (const [rel, content] of Object.entries(files)) assert.equal(read(root, rel), content, rel);
});

test('init is idempotent, and --source changes the command everywhere', () => {
  const root = project();
  init(root);
  assert.deepEqual(planInit(root, TOOLS).filter((c) => actionOf(c) !== 'unchanged'), []);
  init(root, TOOLS, { source: 'C:/packs/projectmind 2.0.0.tgz' });
  assert.equal(cliCommand('C:/packs/projectmind 2.0.0.tgz'), 'npx --yes --package "C:/packs/projectmind 2.0.0.tgz" projectmind');
  const entries = json(root, '.cursor/hooks.json').hooks.preToolUse;
  assert.equal(entries.length, 1, 'replaced, not added');
  assert.equal(entries[0].command, 'npx --yes --package "C:/packs/projectmind 2.0.0.tgz" projectmind guard cursor');
  assert.match(read(root, '.agents/skills/projectmind-why/SKILL.md'), /--package "C:\/packs\/projectmind 2\.0\.0\.tgz" projectmind why/);
});

test('an existing file that is not a JSON object stops init before anything is written', () => {
  const root = project({ '.cursor/hooks.json': '{ broken' });
  const before = snapshot(root);
  assert.throws(() => planInit(root, ['cursor']), /\.cursor\/hooks\.json is not a JSON object/);
  const r = run(['init', '--root', root, '--tools', 'cursor']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /is not a JSON object/);
  assert.deepEqual(snapshot(root), before);
});

test('projectmind init and uninstall: dry run, detection, unknown tools', () => {
  const root = project({ '.cursor/rules/x.mdc': '' });
  const before = snapshot(root);
  const dry = run(['init', '--root', root, '--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^Dry run, nothing is written\. Tools: cursor\n/);
  assert.match(dry.stdout, /would create \.cursor\/hooks\.json/);
  assert.deepEqual(snapshot(root), before);
  const real = run(['init', '--root', root]);
  assert.equal(real.status, 0, real.stderr);
  assert.match(real.stdout, /Next steps:\n- Cursor: hooks run in trusted workspaces only\./);
  assert.match(run(['uninstall', '--root', root, '--dry-run']).stdout, /would remove \.cursor\/hooks\.json/);
  assert.equal(run(['uninstall', '--root', root]).status, 0);
  assert.deepEqual(snapshot(root), before);
  const none = run(['init', '--root', project()]);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /No AI tool detected/);
  const unknown = run(['init', '--root', root, '--tools', 'cursor,vim']);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown tool: vim/);
});
