import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = (rel) => new URL(`../${rel}`, import.meta.url);
const read = (rel) => JSON.parse(fs.readFileSync(url(rel), 'utf8'));
const plugin = read('.claude-plugin/plugin.json');
const catalog = read('.claude-plugin/marketplace.json');

test('catalog: a single entry, this repository\'s plugin, under the same name', () => {
  assert.equal(catalog.plugins.length, 1);
  const [entry] = catalog.plugins;
  assert.equal(entry.source, './');
  // A different name breaks installation: "Plugin "<name>" not found in marketplace".
  assert.equal(entry.name, plugin.name);
});

test('version: set in plugin.json only', () => {
  // When set in both places, plugin.json wins without warning.
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.equal(catalog.plugins[0].version, undefined);
});

test('package.json: the same plugin, version and license, a published bin, no dependency', () => {
  const pkg = read('package.json');
  // npm refused the plain name as too close to "project-mind": the package is scoped, the command is not.
  assert.equal(pkg.name, `@diags/${plugin.name}`);
  assert.equal(pkg.publishConfig?.access, 'public', 'a scoped package is private unless published as public');
  assert.deepEqual(Object.keys(pkg.bin), [plugin.name]);
  assert.equal(pkg.version, plugin.version, 'bump both versions together (ADR-006)');
  assert.equal(pkg.license, plugin.license);
  const bin = pkg.bin.projectmind;
  assert.ok(fs.existsSync(url(bin)), bin);
  assert.ok(pkg.files.some((f) => bin.startsWith(f)), `${bin} is not in "files"`);
  assert.deepEqual(Object.keys(pkg).filter((k) => /dependencies$/i.test(k)), [], 'no dependency (ADR-006)');
});

test('the hook and the skills only call scripts that exist', () => {
  const texts = [
    fs.readFileSync(url('hooks/hooks.json'), 'utf8'),
    ...fs.readdirSync(url('skills/')).map((dir) => fs.readFileSync(url(`skills/${dir}/SKILL.md`), 'utf8')),
  ];
  const scripts = new Set(texts.flatMap((t) => [...t.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+\.mjs)/g)].map((m) => m[1])));
  assert.ok(scripts.size >= 4, [...scripts].join(', '));
  for (const s of scripts) assert.ok(fs.existsSync(url(s)), `${s} is missing`);
});
