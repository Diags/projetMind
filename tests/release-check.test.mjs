import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creer } from '../scripts/lib/adr.mjs';
import { ATTENTION, ECHEC, OK, controler, formater, lireConfig } from '../scripts/lib/release-check.mjs';

const CLI = fileURLToPath(new URL('../scripts/release-check.mjs', import.meta.url));
const GITLEAKS = spawnSync('gitleaks', ['version']).status === 0;
// Faux secret assemblé à l'exécution : il n'apparaît jamais en clair dans ce fichier.
// Au format réel (base32 : lettres et chiffres 2 à 7), sinon gitleaks l'ignore à raison.
const FAUSSE_CLE = ['AKIA', 'Q7XZ2M4N', '6P3R5T2V'].join('');

const temporaires = [];
after(() => temporaires.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const ecrire = (racine, rel, contenu) => {
  fs.mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
  fs.writeFileSync(path.join(racine, rel), contenu);
};
const git = (racine, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@exemple.fr', '-c', 'core.autocrlf=false', ...args], { cwd: racine, stdio: 'pipe' });
const section = (rapport, id) => rapport.sections.find((s) => s.id === id);

// main : src/a.js protégé par ADR-001. La branche le touche, modifie ADR-001, ajoute ADR-002,
// un fichier avec une fausse clé AWS en ligne 2 et un .env.
function depot({ propre = false } = {}) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporaires.push(racine);
  git(racine, 'init', '-q', '-b', 'main');
  ecrire(racine, 'src/a.js', 'a\n');
  ecrire(racine, 'src/libre.js', 'b\n');
  creer(racine, {
    titre: 'A est figé',
    raison: 'Parce que.',
    fichiers_proteges: propre ? ['src/a.js'] : ['src/a.js', 'ancien/**'],
    contexte: 'c',
    decision: 'd',
  });
  git(racine, 'add', '.');
  git(racine, 'commit', '-q', '-m', 'base');
  git(racine, 'checkout', '-q', '-b', 'branche');
  ecrire(racine, 'src/libre.js', 'b2\n');
  if (!propre) {
    ecrire(racine, 'src/a.js', 'a2\n');
    fs.appendFileSync(path.join(racine, 'docs', 'decisions', 'ADR-001-a-est-fige.md'), 'Ajout.\n');
    creer(racine, { titre: 'Nouvelle', raison: 'r', contexte: 'c', decision: 'd' });
    ecrire(racine, 'src/config.js', `// réglages\nconst cle = "${FAUSSE_CLE}";\n`);
    ecrire(racine, '.env', 'X=1\n');
    ecrire(racine, '.env.example', 'X=\n');
  }
  git(racine, 'add', '.');
  git(racine, 'commit', '-q', '-m', 'travail');
  return racine;
}

test('rapport complet : ADR touchés, secrets masqués, commande en échec → ✗', () => {
  const racine = depot();
  const r = controler(racine, { controle: 'echo casse; exit 3', gitleaks: false });
  assert.equal(r.branche, 'branche');
  assert.equal(r.base, 'main');
  assert.equal(r.commits, 1);

  const controle = section(r, 'controle');
  assert.equal(controle.etat, ECHEC);
  assert.match(controle.lignes[0], /^echo casse; exit 3 → code 3, \d+ s$/);
  assert.equal(fs.readFileSync(controle.journal, 'utf8').trim(), 'casse');
  fs.rmSync(controle.journal);

  const adr = section(r, 'adr');
  assert.equal(adr.etat, ATTENTION);
  assert.deepEqual(adr.lignes, [
    'ADR modifié sur la branche : docs/decisions/ADR-001-a-est-fige.md — à relire en PR',
    'ADR ajouté : docs/decisions/ADR-002-nouvelle.md',
    'src/a.js touché — protégé par ADR-001 « A est figé » (motif : src/a.js)',
    'ADR-001 : le motif « ancien/** » ne désigne aucun fichier suivi',
  ]);

  const secrets = section(r, 'secrets');
  assert.equal(secrets.etat, ECHEC);
  assert.deepEqual(secrets.lignes.slice(1), [
    '.env — fichier sensible versionné par la branche',
    'src/config.js:2 — clé AWS',
  ]);
  assert.match(secrets.lignes[0], /motifs intégrés .* gitleaks absent/);

  assert.equal(r.verdict, ECHEC);
  const texte = formater(r);
  assert.doesNotMatch(texte, new RegExp(FAUSSE_CLE), 'la valeur du secret ne doit jamais sortir');
  assert.match(texte, /Verdict : ✗ Non prêt\n$/);
});

test('gitleaks, quand il est installé : trouve la clé et masque sa valeur', { skip: !GITLEAKS && 'gitleaks absent' }, () => {
  const racine = depot();
  const secrets = section(controler(racine, { sansControle: true }), 'secrets');
  assert.equal(secrets.etat, ECHEC);
  assert.match(secrets.lignes[0], /gitleaks \d/);
  assert.ok(secrets.lignes.some((l) => /^src\/config\.js:2 — \S+ \(commit [0-9a-f]{7}\)$/.test(l)), secrets.lignes.join('\n'));
  assert.doesNotMatch(secrets.lignes.join('\n'), new RegExp(FAUSSE_CLE));
});

test('branche propre et commande verte → ✓ Prêt', () => {
  const racine = depot({ propre: true });
  const r = controler(racine, { controle: 'echo ok', gitleaks: false });
  assert.deepEqual(r.sections.map((s) => [s.id, s.etat]), [
    ['controle', OK],
    ['adr', OK],
    ['secrets', OK],
    ['arbre', OK],
  ]);
  assert.deepEqual(section(r, 'adr').lignes, ['1 ADR lus : aucun fichier protégé touché, aucune anomalie']);
  assert.match(formater(r), /Verdict : ✓ Prêt\n$/);
  fs.rmSync(section(r, 'controle').journal);
});

test('sans commande déclarée, ou avec des fichiers non commités → ⚠', () => {
  const racine = depot({ propre: true });
  ecrire(racine, 'brouillon.txt', 'x');
  const r = controler(racine, { gitleaks: false });
  assert.equal(section(r, 'controle').etat, ATTENTION);
  assert.match(section(r, 'controle').lignes[0], /aucune commande déclarée/);
  assert.equal(section(r, 'controle').journal, undefined);
  assert.equal(section(r, 'arbre').etat, ATTENTION);
  assert.equal(r.verdict, ATTENTION);
});

test('la commande et la base viennent de .projectmind.json', () => {
  const racine = depot({ propre: true });
  ecrire(racine, '.projectmind.json', JSON.stringify({ controle: 'echo depuis la config', base: 'main', inconnue: 1 }));
  git(racine, 'add', '.');
  git(racine, 'commit', '-q', '-m', 'config');
  assert.deepEqual(lireConfig(racine), {
    config: { controle: 'echo depuis la config', base: 'main', inconnue: 1 },
    erreurs: ['.projectmind.json : clé inconnue « inconnue »'],
    fichier: '.projectmind.json',
  });
  const r = controler(racine, { gitleaks: false });
  assert.equal(section(r, 'configuration').etat, ATTENTION);
  assert.match(section(r, 'controle').lignes[0], /^echo depuis la config → code 0/);
  fs.rmSync(section(r, 'controle').journal);
});

test('.claude/projectmind.json reste lu, mais .projectmind.json passe avant', () => {
  const racine = depot({ propre: true });
  assert.deepEqual(lireConfig(racine), { config: {}, erreurs: [], fichier: null });
  ecrire(racine, '.claude/projectmind.json', JSON.stringify({ controle: 'echo ancien' }));
  assert.deepEqual(lireConfig(racine), { config: { controle: 'echo ancien' }, erreurs: [], fichier: '.claude/projectmind.json' });
  ecrire(racine, '.projectmind.json', JSON.stringify({ controle: 'echo nouveau' }));
  const { config, erreurs, fichier } = lireConfig(racine);
  assert.deepEqual(config, { controle: 'echo nouveau' });
  assert.equal(fichier, '.projectmind.json');
  assert.equal(erreurs.length, 1, 'l\'ancien fichier ignoré est signalé');
  assert.match(erreurs[0], /^\.claude\/projectmind\.json /);
});

test('CLI : code 1 si non prêt, 0 si prêt, 2 si la base est introuvable', () => {
  const lancer = (racine, ...args) => spawnSync(process.execPath, [CLI, '--racine', racine, '--sans-controle', ...args], { encoding: 'utf8' });
  const sale = lancer(depot());
  assert.equal(sale.status, 1, sale.stderr);
  assert.match(sale.stdout, /^Contrôle avant livraison — branche \([0-9a-f]+\) contre main/);
  assert.equal(lancer(depot({ propre: true })).status, 0);
  const sansBase = lancer(depot({ propre: true }), '--base', 'nexistepas');
  assert.equal(sansBase.status, 2);
  assert.match(sansBase.stderr, /base introuvable : nexistepas/);
});
