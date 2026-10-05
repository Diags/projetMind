import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lire = (rel) => JSON.parse(fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const plugin = lire('.claude-plugin/plugin.json');
const catalogue = lire('.claude-plugin/marketplace.json');

test('catalogue : une seule entrée, le plugin de ce dépôt, au même nom', () => {
  assert.equal(catalogue.plugins.length, 1);
  const [entree] = catalogue.plugins;
  assert.equal(entree.source, './');
  // Un nom différent casse l'installation : « Plugin "<nom>" not found in marketplace ».
  assert.equal(entree.name, plugin.name);
});

test('version : définie dans plugin.json seulement', () => {
  // Définie aux deux endroits, celle de plugin.json gagne sans prévenir.
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.equal(catalogue.plugins[0].version, undefined);
});
