import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  slugifier, prochainNumero, formaterId, creer, analyserEnTete, lireDecisions, ErreurAdr,
} from '../scripts/lib/adr.mjs';

const CLI = fileURLToPath(new URL('../scripts/adr.mjs', import.meta.url));
const temporaires = [];
const projetVide = () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporaires.push(racine);
  return racine;
};
after(() => temporaires.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const decisions = (racine) => fs.readdirSync(path.join(racine, 'docs', 'decisions')).sort();

const ENTREE = {
  titre: 'La mémoire vit dans le dépôt cible',
  raison: "Le dossier du plugin est copié en cache à l'installation ; la mémoire doit être versionnée.",
  fichiers_proteges: ['docs/decisions/**', '*.sql', './src\\app.js'],
  alternatives_rejetees: ['.projectmind/ : second registre # à côté de CLAUDE.md'],
  contexte: 'Contexte.',
  decision: 'Décision.',
};

test('slugifier : accents, ponctuation, ligatures', () => {
  assert.equal(slugifier('La mémoire vit dans le dépôt cible'), 'la-memoire-vit-dans-le-depot-cible');
  assert.equal(slugifier("L'œuvre : Ça marche !"), 'l-oeuvre-ca-marche');
  assert.equal(slugifier('!!!'), 'decision');
});

test('slugifier : un titre long est coupé entre deux mots', () => {
  const slug = slugifier('Les hooks sont écrits en Node et non en shell parce que jq est absent du poste Windows');
  assert.ok(slug.length <= 60, slug);
  assert.equal(slug, 'les-hooks-sont-ecrits-en-node-et-non-en-shell-parce-que-jq');
});

test('prochainNumero : suit le plus grand numéro et ignore les autres fichiers', () => {
  assert.equal(prochainNumero([]), 1);
  assert.equal(prochainNumero(['ADR-001-a.md', 'ADR-003-b.md', 'README.md', 'ADR-x.md', 'adr-002-c.txt']), 4);
  assert.equal(formaterId(4), 'ADR-004');
  assert.equal(formaterId(1000), 'ADR-1000');
});

test('creer : ADR-001 puis ADR-002, et l\'essai n\'écrit rien', () => {
  const racine = projetVide();
  assert.equal(creer(racine, ENTREE).chemin, 'docs/decisions/ADR-001-la-memoire-vit-dans-le-depot-cible.md');
  assert.equal(creer(racine, { ...ENTREE, titre: 'Hooks en Node' }).id, 'ADR-002');
  const essai = creer(racine, { ...ENTREE, titre: 'Troisième' }, { essai: true });
  assert.equal(essai.id, 'ADR-003');
  assert.deepEqual(decisions(racine), ['ADR-001-la-memoire-vit-dans-le-depot-cible.md', 'ADR-002-hooks-en-node.md']);
});

test('creer : un trou dans la suite n\'est pas réutilisé', () => {
  const racine = projetVide();
  fs.mkdirSync(path.join(racine, 'docs', 'decisions'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'docs', 'decisions', 'ADR-007-ancienne.md'), '');
  assert.equal(creer(racine, ENTREE).id, 'ADR-008');
});

test('creer puis lireDecisions : les champs reviennent intacts', () => {
  const racine = projetVide();
  creer(racine, ENTREE, { date: '2026-10-05' });
  const [adr] = lireDecisions(racine);
  assert.deepEqual(adr, {
    fichier: 'docs/decisions/ADR-001-la-memoire-vit-dans-le-depot-cible.md',
    id: 'ADR-001',
    titre: ENTREE.titre,
    statut: 'acceptée',
    date: '2026-10-05',
    fichiers_proteges: ['docs/decisions/**', '*.sql', 'src/app.js'],
    raison: ENTREE.raison,
    alternatives_rejetees: ENTREE.alternatives_rejetees,
    erreurs: [],
  });
});

test('creer : refuse une entrée incomplète ou hors du projet, sans rien écrire', () => {
  const racine = projetVide();
  const refus = (entree) => {
    try {
      creer(racine, entree);
    } catch (e) {
      assert.ok(e instanceof ErreurAdr);
      return e.erreurs;
    }
    assert.fail('aucune erreur levée');
  };
  assert.equal(refus({ titre: 'Sans raison' }).length, 3); // raison, contexte, decision
  assert.match(refus({ ...ENTREE, fichiers_proteges: ['/etc/passwd'] })[0], /hors du projet/);
  assert.match(refus({ ...ENTREE, fichiers_proteges: ['C:/x'] })[0], /hors du projet/);
  assert.match(refus({ ...ENTREE, fichiers_proteges: ['src/../../x'] })[0], /hors du projet/);
  assert.match(refus({ ...ENTREE, fichiers_proteges: 'src/a.js' })[0], /liste/);
  assert.match(refus({ ...ENTREE, fichiers: ['src/a.js'] })[0], /clé inconnue/);
  assert.equal(fs.existsSync(path.join(racine, 'docs')), false);
});

test('analyserEnTete : en-tête écrit à la main, fins de ligne CRLF', () => {
  const texte = [
    '---',
    'id: ADR-005',
    'titre: Titre sans guillemets # commentaire',
    '# ligne de commentaire',
    'fichiers_proteges:',
    '  - runtime/**',
    "  - 'src/l''app.js'",
    'raison: Une raison',
    '  sur deux lignes.',
    'alternatives_rejetees: [MongoDB, "SQLite, en local"]',
    'consequences: >',
    '  Plié',
    '  ici.',
    'contexte: |',
    '  ligne 1',
    '  ligne 2',
    '---',
    'corps',
  ].join('\r\n');
  assert.deepEqual(analyserEnTete(texte), {
    donnees: {
      id: 'ADR-005',
      titre: 'Titre sans guillemets',
      fichiers_proteges: ['runtime/**', "src/l'app.js"],
      raison: 'Une raison sur deux lignes.',
      alternatives_rejetees: ['MongoDB', 'SQLite, en local'],
      consequences: 'Plié ici.',
      contexte: 'ligne 1\nligne 2',
    },
    erreurs: [],
  });
});

test('analyserEnTete : liste en tirets non indentée et liste vide', () => {
  const texte = '---\nfichiers_proteges:\n- a.js\n- "b/**"\nalternatives_rejetees: []\n---\n';
  assert.deepEqual(analyserEnTete(texte).donnees, { fichiers_proteges: ['a.js', 'b/**'], alternatives_rejetees: [] });
});

test('analyserEnTete : signale l\'absence d\'en-tête ou un en-tête non fermé', () => {
  assert.equal(analyserEnTete('# Titre\n').donnees, null);
  assert.match(analyserEnTete('---\nid: ADR-001\n').erreurs[0], /non fermé/);
});

test('lireDecisions : garde une décision mal formée et signale l\'anomalie', () => {
  const racine = projetVide();
  const dossier = path.join(racine, 'docs', 'decisions');
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, 'ADR-002-a-la-main.md'), '---\nid: ADR-009\nfichiers_proteges: src\\a.js\n---\n');
  const [adr] = lireDecisions(racine);
  assert.deepEqual(adr.fichiers_proteges, ['src/a.js']);
  assert.deepEqual(adr.erreurs, [
    '« fichiers_proteges » devrait être une liste',
    '« raison » manquante',
    '« id » vaut ADR-009 mais le nom du fichier donne ADR-002',
  ]);
});

const lancer = (args, entree) => spawnSync(process.execPath, [CLI, ...args], { input: entree, encoding: 'utf8' });

test('CLI : essai, création, liste', () => {
  const racine = projetVide();
  const essai = lancer(['creer', '--essai', '--racine', racine], JSON.stringify(ENTREE));
  assert.equal(essai.status, 0, essai.stderr);
  assert.match(essai.stdout, /^Aperçu, rien n'est écrit : docs\/decisions\/ADR-001-/);
  assert.equal(fs.existsSync(path.join(racine, 'docs')), false);

  const reel = lancer(['creer', '--racine', racine], JSON.stringify(ENTREE));
  assert.equal(reel.status, 0, reel.stderr);
  assert.equal(reel.stdout.trim(), 'ADR créé : docs/decisions/ADR-001-la-memoire-vit-dans-le-depot-cible.md');

  const liste = lancer(['lister', '--racine', racine]);
  assert.equal(JSON.parse(liste.stdout).length, 1);
});

test('CLI : erreurs lisibles et code de sortie 1', () => {
  const racine = projetVide();
  const json = lancer(['creer', '--racine', racine], '{ pas du json');
  assert.equal(json.status, 1);
  assert.match(json.stderr, /JSON illisible/);
  const dossier = lancer(['lister', '--racine', path.join(racine, 'absent')]);
  assert.equal(dossier.status, 1);
  assert.match(dossier.stderr, /introuvable/);
});
