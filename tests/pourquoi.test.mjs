import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creer } from '../scripts/lib/adr.mjs';
import { mention, pourquoi, formater } from '../scripts/lib/pourquoi.mjs';

const CLI = fileURLToPath(new URL('../scripts/pourquoi.mjs', import.meta.url));
const temporaires = [];
after(() => temporaires.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const dossierVide = () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'projectmind-'));
  temporaires.push(racine);
  return racine;
};
const ecrire = (racine, rel, contenu) => {
  fs.mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
  fs.writeFileSync(path.join(racine, rel), contenu);
};
const git = (racine, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@exemple.fr', '-c', 'core.autocrlf=false', ...args], { cwd: racine, stdio: 'pipe' });

const DETTE = [
  '# Dette',
  'Voir `src/auth/prenom.ts` pour le cas des prénoms composés.',
  'La fin de chemin auth/prenom.ts compte aussi.',
  'Le nom seul prenom.ts compte, il est unique.',
  'Un autre projet : config/prenom.ts ne compte pas.',
  'Ni prenom.tsx, ni src/auth/prenom.ts.bak.',
  'Les index : lib/index.ts oui, index.ts seul non.',
].join('\n');

// Dépôt jetable : deux commits touchent src/auth/prenom.ts, un ADR le protège et le cite.
function depot() {
  const racine = dossierVide();
  git(racine, 'init', '-q');
  ecrire(racine, 'src/auth/prenom.ts', 'export const a = 1;\n');
  ecrire(racine, 'src/index.ts', '');
  ecrire(racine, 'lib/index.ts', '');
  ecrire(racine, 'DETTE.md', DETTE);
  git(racine, 'add', '.');
  git(racine, 'commit', '-q', '-m', 'Premier jet du prénom');
  ecrire(racine, 'src/auth/prenom.ts', 'export const a = 2;\n');
  git(racine, 'commit', '-q', '-am', 'Prénoms composés');
  creer(racine, {
    titre: 'Prénoms en NFC',
    raison: 'Comparer des prénoms exige une forme unique.',
    fichiers_proteges: ['src/auth/**'],
    contexte: 'Le code de src/auth/prenom.ts compare des chaînes.',
    decision: 'Tout passe par NFC.',
  });
  return racine;
}

test('mention : chemin, fin de chemin, nom seul, et faux amis', () => {
  const rel = 'src/auth/prenom.ts';
  assert.equal(mention('voir `src/auth/prenom.ts`.', rel, true), 'chemin');
  assert.equal(mention('voir ./src/auth/prenom.ts', rel, true), 'chemin');
  assert.equal(mention('voir auth/prenom.ts', rel, true), 'fin de chemin');
  assert.equal(mention('voir prenom.ts, puis', rel, true), 'nom seul');
  assert.equal(mention('voir prenom.ts', rel, false), null, 'nom partagé par plusieurs fichiers');
  assert.equal(mention('config/prenom.ts', rel, true), null);
  assert.equal(mention('prenom.tsx', rel, true), null);
  assert.equal(mention('src/auth/prenom.ts.bak', rel, true), null);
  assert.equal(mention('xsrc/auth/prenom.ts', rel, true), null);
  assert.equal(mention('prenom.ts puis src/auth/prenom.ts', rel, true), 'chemin', 'la plus sûre gagne');
});

test('pourquoi : ADR, mentions et historique, chacun avec sa source', () => {
  const racine = depot();
  const r = pourquoi(racine, path.join(racine, 'src', 'auth', 'prenom.ts'));
  assert.equal(r.fichier, 'src/auth/prenom.ts');
  assert.deepEqual(r.avertissements, []);

  assert.equal(r.decisions.length, 1);
  const [d] = r.decisions;
  assert.equal(d.id, 'ADR-001');
  assert.deepEqual(d.motifs, ['src/auth/**']);
  assert.equal(d.actif, true);
  assert.deepEqual(d.citations.map((c) => c.par), ['chemin'], "l'en-tête de l'ADR n'est pas compté comme mention");

  assert.deepEqual(r.documentation.map((m) => [m.fichier, m.ligne, m.par]), [
    ['DETTE.md', 2, 'chemin'],
    ['DETTE.md', 3, 'fin de chemin'],
    ['DETTE.md', 4, 'nom seul'],
  ]);

  assert.deepEqual(r.historique.map((c) => c.titre), ['Prénoms composés', 'Premier jet du prénom']);
  assert.match(r.historique[0].hash, /^[0-9a-f]{7,}$/);
  assert.match(r.historique[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

test('pourquoi : un nom partagé n\'est pas cherché seul, et la sortie le dit', () => {
  const racine = depot();
  const r = pourquoi(racine, path.join(racine, 'lib', 'index.ts'));
  assert.equal(r.homonymes, 1);
  assert.deepEqual(r.documentation.map((m) => [m.ligne, m.par]), [[7, 'chemin']]);
  assert.match(formater(r), /Nom seul non cherché : 1 autre\(s\) fichier\(s\) s'appellent index\.ts\./);
});

test('pourquoi : rien trouvé est dit tel quel', () => {
  const racine = depot();
  const texte = formater(pourquoi(racine, path.join(racine, 'src', 'index.ts')));
  assert.match(texte, /Aucun ADR ne protège ni ne cite ce fichier\./);
  assert.match(texte, /Aucune mention trouvée\./);
});

test('pourquoi : hors d\'un dépôt git, seuls les ADR sont lus', () => {
  const racine = dossierVide();
  creer(racine, { titre: 'T', raison: 'R', fichiers_proteges: ['a.js'], contexte: 'c', decision: 'd' });
  const r = pourquoi(racine, path.join(racine, 'a.js'));
  assert.equal(r.decisions[0].id, 'ADR-001');
  assert.equal(r.historique, null);
  assert.deepEqual(r.avertissements, [
    'pas un dépôt git : seuls les ADR sont lus, sans historique.',
    'a.js est introuvable sur le disque ; la recherche est faite quand même.',
  ]);
});

test('CLI : sortie texte avec les sources, erreur hors du projet', () => {
  const racine = depot();
  const r = spawnSync(process.execPath, [CLI, '--racine', racine, 'src/auth/prenom.ts'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Pourquoi src\/auth\/prenom\.ts \?/);
  assert.match(r.stdout, /- ADR-001 « Prénoms en NFC » — docs\/decisions\/ADR-001-prenoms-en-nfc\.md/);
  assert.match(r.stdout, /- DETTE\.md:2 \[chemin\] Voir `src\/auth\/prenom\.ts`/);
  assert.match(r.stdout, /Prénoms composés/);

  const hors = spawnSync(process.execPath, [CLI, '--racine', racine, '../ailleurs.ts'], { encoding: 'utf8' });
  assert.equal(hors.status, 1);
  assert.match(hors.stderr, /hors du projet/);
});
