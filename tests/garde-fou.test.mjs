import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creer } from '../scripts/lib/adr.mjs';
import { correspond, cheminRelatif, estActif, protections } from '../scripts/lib/garde-fou.mjs';
import { decider } from '../scripts/lib/adaptateurs/claude-code.mjs';

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
  const texte = fs.readFileSync(fichier, 'utf8');
  assert.match(texte, /\nstatus: accepted\n/);
  fs.writeFileSync(fichier, texte.replace('status: accepted', 'status: superseded by ADR-001'));
  return racine;
}

// [id, motifs] de chaque ADR qui protège le fichier : ce qui ne dépend pas de la langue des messages.
const touchees = (p) => p.touchees.map((t) => [t.adr.id, t.motifs]);

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

test('estActif : un ADR protège tant que son statut ne le dit pas remplacé, abandonné ou rejeté', () => {
  for (const statut of ['accepted', 'proposed', 'acceptée', 'Acceptée', '', undefined]) {
    assert.equal(estActif({ statut }), true, String(statut));
  }
  for (const statut of ['superseded by ADR-002', 'Superseded', 'deprecated', 'rejected', 'Remplacée par ADR-002', 'abandonnée', 'rejetée']) {
    assert.equal(estActif({ statut }), false, statut);
  }
});

test('protections : les ADR actifs qui protègent le fichier, avec leurs motifs', () => {
  const racine = projet();
  const p = protections(racine, path.join(racine, 'src', 'a.js'));
  assert.equal(p.fichier, 'src/a.js');
  assert.equal(p.estUnAdr, false);
  assert.deepEqual(touchees(p), [['ADR-001', ['src/a.js']]], 'ADR-003 est remplacé : il ne protège plus');
  assert.deepEqual(touchees(protections(racine, 'src/a.js')), [['ADR-001', ['src/a.js']]], 'chemin relatif à la racine');
  assert.deepEqual(touchees(protections(racine, path.join(racine, 'runtime', 'x', 'y.py'))), [['ADR-001', ['runtime/**']]]);
  assert.deepEqual(touchees(protections(racine, path.join(racine, 'db', 'm', '001.sql'))), [['ADR-002', ['**/*.sql']]]);
});

test('protections : un fichier protégé par plusieurs ADR les cite tous', () => {
  const racine = projet();
  creer(racine, { ...ADR, titre: 'Pas de SQL dans runtime', fichiers_proteges: ['runtime/**/*.sql'] });
  assert.deepEqual(touchees(protections(racine, path.join(racine, 'runtime', 'a.sql'))), [
    ['ADR-001', ['runtime/**']],
    ['ADR-002', ['**/*.sql']],
    ['ADR-004', ['runtime/**/*.sql']],
  ]);
});

test('protections : un ADR est protégé, même sans motif qui le vise', () => {
  const racine = projet();
  const p = protections(racine, path.join(racine, 'docs', 'decisions', 'ADR-001-runtime-fige.md'));
  assert.equal(p.estUnAdr, true);
  assert.deepEqual(p.touchees, []);
  assert.equal(protections(racine, path.join(racine, 'docs', 'decisions', 'ADR-009-nouveau.md')).estUnAdr, true);
  assert.equal(protections(racine, path.join(racine, 'docs', 'decisions', 'notes.md')), null);
  assert.equal(protections(racine, path.join(racine, 'docs', 'ADR-001-ailleurs.md')), null);
});

test('protections : rien à dire hors protection', () => {
  const racine = projet();
  assert.equal(protections(racine, path.join(racine, 'src', 'b.js')), null);
  assert.equal(protections(racine, path.join(racine, '..', 'ailleurs', 'src', 'a.js')), null);
  assert.equal(protections(racine, ''), null);
  assert.equal(protections(racine, undefined), null);
  const vide = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporaires.push(vide);
  assert.equal(protections(vide, path.join(vide, 'src', 'a.js')), null);
});

// Le seul test qui lit le texte du message : il change avec la langue.
test('message : cite l\'ADR, son motif, sa raison, ses alternatives et sa source', () => {
  const racine = projet();
  const { message } = protections(racine, path.join(racine, 'src', 'a.js'));
  assert.match(message, /^ProjectMind : src\/a\.js est protégé par une décision\./);
  assert.match(message, /ADR-001 — Runtime figé \[motif : src\/a\.js\]/);
  assert.match(message, /Raison : Raison de test\./);
  assert.match(message, /Alternatives rejetées : Tout réécrire : trop risqué/);
  assert.match(message, /Source : docs\/decisions\/ADR-001-runtime-fige\.md/);
  assert.equal(message.split('\n\n').length, 3, 'en-tête, un bloc par ADR, consigne finale');
  const adr = protections(racine, path.join(racine, 'docs', 'decisions', 'ADR-001-runtime-fige.md')).message;
  assert.equal(adr.split('\n\n').length, 2, 'en-tête et avertissement ADR, sans consigne de mise à jour');
});

const appel = (racine, tool_name, relatif, champ = 'file_path') => ({
  hook_event_name: 'PreToolUse',
  tool_name,
  tool_input: { [champ]: path.join(racine, relatif) },
  cwd: racine,
});

test('Claude Code : chaque outil de modification reçoit une demande de confirmation', () => {
  const racine = projet();
  for (const [outil, relatif, champ] of [
    ['Edit', 'src/a.js'],
    ['Write', 'runtime/x/y.py'],
    ['MultiEdit', 'db/m/001.sql'],
    ['NotebookEdit', 'runtime/n.ipynb', 'notebook_path'],
    ['Edit', 'docs/decisions/ADR-001-runtime-fige.md'],
  ]) {
    const sortie = decider(appel(racine, outil, relatif, champ), racine);
    assert.deepEqual(sortie, {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: protections(racine, path.join(racine, relatif)).message,
      },
    }, `${outil} ${relatif}`);
  }
});

test('Claude Code : rien à dire hors protection ou hors outil de modification', () => {
  const racine = projet();
  assert.equal(decider(appel(racine, 'Edit', 'src/b.js'), racine), null);
  assert.equal(decider(appel(racine, 'Read', 'src/a.js'), racine), null);
  assert.equal(decider(appel(racine, 'NotebookEdit', 'src/a.js'), racine), null, 'NotebookEdit lit notebook_path');
  assert.equal(decider({ tool_name: 'Bash', tool_input: { command: 'rm src/a.js' } }, racine), null);
  assert.equal(decider({ tool_name: 'Edit', tool_input: {} }, racine), null);
  assert.equal(decider({ tool_name: 'Edit' }, racine), null);
  assert.equal(decider(null, racine), null);
});

// Le faux appel : le script du hook, tel que Claude Code le lance.
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
  assert.match(r.stderr, /^ProjectMind/);
});
