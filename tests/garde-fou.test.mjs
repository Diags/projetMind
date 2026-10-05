import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creer } from '../scripts/lib/adr.mjs';
import { correspond, cheminRelatif, decider } from '../scripts/lib/garde-fou.mjs';

const HOOK = fileURLToPath(new URL('../hooks/garde-fou.mjs', import.meta.url));
const temporaires = [];
after(() => temporaires.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const ADR = { raison: 'Raison de test.', contexte: 'c', decision: 'd' };

// Projet jetable : ADR-001 protège src/a.js et runtime/**, ADR-002 tous les .sql,
// ADR-003 protège aussi src/a.js mais il est remplacé.
function projet() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporaires.push(racine);
  creer(racine, { ...ADR, titre: 'Runtime figé', fichiers_proteges: ['src/a.js', 'runtime/**'], alternatives_rejetees: ['Tout réécrire : trop risqué'] });
  creer(racine, { ...ADR, titre: 'Migrations SQL', fichiers_proteges: ['**/*.sql'] });
  const { chemin } = creer(racine, { ...ADR, titre: 'Ancienne règle', fichiers_proteges: ['src/a.js'] });
  const fichier = path.join(racine, chemin);
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('statut: acceptée', 'statut: Remplacée par ADR-001'));
  return racine;
}

const appel = (racine, tool_name, relatif, champ = 'file_path') => ({
  hook_event_name: 'PreToolUse',
  tool_name,
  tool_input: { [champ]: path.join(racine, relatif) },
  cwd: racine,
});

test('correspond : jokers, dossiers, casse', () => {
  const cas = [
    ['src/a.js', 'src/a.js', true],
    ['src/a.js', 'src/a.jsx', false],
    ['runtime/**', 'runtime/x/y.py', true],
    ['runtime/**', 'runtimes/x.py', false],
    ['runtime', 'runtime/x.py', true],
    ['runtime/', 'runtime/x.py', true],
    ['*.sql', 'a.sql', true],
    ['*.sql', 'db/a.sql', false],
    ['**/*.sql', 'db/x/a.sql', true],
    ['**/*.sql', 'a.sql', true],
    ['src/**/test.js', 'src/test.js', true],
    ['src/?.js', 'src/b.js', true],
    ['./src\\a.js', 'src/a.js', true],
    ['a.b', 'axb', false],
  ];
  for (const [motif, chemin, attendu] of cas) assert.equal(correspond(motif, chemin, true), attendu, `${motif} / ${chemin}`);
  assert.equal(correspond('SRC/A.js', 'src/a.js', false), true);
  assert.equal(correspond('SRC/A.js', 'src/a.js', true), false);
});

test('cheminRelatif : dans le projet ou hors du projet', () => {
  const racine = path.resolve(os.tmpdir(), 'projet');
  assert.equal(cheminRelatif(racine, path.join(racine, 'src', 'a.js')), 'src/a.js');
  assert.equal(cheminRelatif(racine, path.join(racine, '..', 'autre', 'a.js')), null);
  assert.equal(cheminRelatif(racine, racine), null);
});

test('decider : fichier protégé → demande de confirmation citant l\'ADR', () => {
  const racine = projet();
  const sortie = decider(appel(racine, 'Edit', 'src/a.js'), racine);
  assert.equal(sortie.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(sortie.hookSpecificOutput.permissionDecision, 'ask');
  const raison = sortie.hookSpecificOutput.permissionDecisionReason;
  assert.match(raison, /^ProjectMind : src\/a\.js est protégé par une décision\./);
  assert.match(raison, /ADR-001 — Runtime figé \[motif : src\/a\.js\]/);
  assert.match(raison, /Raison : Raison de test\./);
  assert.match(raison, /Alternatives rejetées : Tout réécrire : trop risqué/);
  assert.match(raison, /Source : docs\/decisions\/ADR-001-runtime-fige\.md/);
  assert.doesNotMatch(raison, /ADR-003/, 'un ADR remplacé ne protège plus');
});

test('decider : chaque outil de modification est surveillé', () => {
  const racine = projet();
  assert.match(decider(appel(racine, 'Write', 'runtime/x/y.py'), racine).hookSpecificOutput.permissionDecisionReason, /ADR-001/);
  assert.match(decider(appel(racine, 'MultiEdit', 'db/m/001.sql'), racine).hookSpecificOutput.permissionDecisionReason, /ADR-002 — Migrations SQL/);
  assert.match(decider(appel(racine, 'NotebookEdit', 'runtime/n.ipynb', 'notebook_path'), racine).hookSpecificOutput.permissionDecisionReason, /ADR-001/);
});

test('decider : rien à dire hors protection', () => {
  const racine = projet();
  assert.equal(decider(appel(racine, 'Edit', 'src/b.js'), racine), null);
  assert.equal(decider(appel(racine, 'Read', 'src/a.js'), racine), null);
  assert.equal(decider({ tool_name: 'Bash', tool_input: { command: 'rm src/a.js' } }, racine), null);
  assert.equal(decider(appel(racine, 'Edit', '../ailleurs/src/a.js'), racine), null);
  assert.equal(decider({ tool_name: 'Edit', tool_input: {} }, racine), null);
  const vide = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporaires.push(vide);
  assert.equal(decider(appel(vide, 'Edit', 'src/a.js'), vide), null);
});

test('decider : un fichier protégé par plusieurs ADR les cite tous', () => {
  const racine = projet();
  creer(racine, { ...ADR, titre: 'Pas de SQL dans runtime', fichiers_proteges: ['runtime/**/*.sql'] });
  const raison = decider(appel(racine, 'Edit', 'runtime/a.sql'), racine).hookSpecificOutput.permissionDecisionReason;
  assert.match(raison, /ADR-001/);
  assert.match(raison, /ADR-002/);
  assert.match(raison, /ADR-004/);
});

test('decider : modifier ou créer un ADR à la main demande confirmation', () => {
  const racine = projet();
  const modifier = decider(appel(racine, 'Edit', 'docs/decisions/ADR-001-runtime-fige.md'), racine);
  assert.equal(modifier.hookSpecificOutput.permissionDecision, 'ask');
  const raison = modifier.hookSpecificOutput.permissionDecisionReason;
  assert.match(raison, /Ce fichier est un ADR/);
  assert.doesNotMatch(raison, /mets alors l'ADR à jour/, 'aucun ADR ne protège ce fichier par motif');
  assert.match(decider(appel(racine, 'Write', 'docs/decisions/ADR-009-nouveau.md'), racine).hookSpecificOutput.permissionDecisionReason, /est un ADR/);
  assert.equal(decider(appel(racine, 'Write', 'docs/decisions/notes.md'), racine), null);
  assert.equal(decider(appel(racine, 'Write', 'docs/ADR-001-ailleurs.md'), racine), null);
});

// Le faux appel du critère du lot 3 : le script du hook, tel que Claude Code le lance.
const lancerHook = (racine, entree) => spawnSync(process.execPath, [HOOK], {
  input: typeof entree === 'string' ? entree : JSON.stringify(entree),
  encoding: 'utf8',
  env: { ...process.env, CLAUDE_PROJECT_DIR: racine },
});

test('hook : faux appel sur un fichier protégé → JSON « ask » et code 0', () => {
  const racine = projet();
  const r = lancerHook(racine, appel(racine, 'Edit', 'src/a.js'));
  assert.equal(r.status, 0, r.stderr);
  const sortie = JSON.parse(r.stdout);
  assert.equal(sortie.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(sortie.hookSpecificOutput.permissionDecisionReason, /ADR-001 — Runtime figé/);
});

test('hook : fichier libre → aucune sortie et code 0', () => {
  const racine = projet();
  const r = lancerHook(racine, appel(racine, 'Edit', 'src/b.js'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('hook : entrée illisible → code 1, l\'outil suit son cours', () => {
  const racine = projet();
  const r = lancerHook(racine, '{ pas du json');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /garde-fou en erreur/);
});
