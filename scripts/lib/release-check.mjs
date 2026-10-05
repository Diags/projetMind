// /projectmind:release-check : rapport ✓/⚠/✗ d'une branche avant livraison.
// Lance la commande de contrôle du projet, regarde les ADR que la branche touche et cherche
// les secrets dans ce qu'elle ajoute. Ne corrige rien, ne fait aucun fetch, n'affiche
// jamais la valeur d'un secret : seulement son fichier, sa ligne et son type.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ErreurAdr, lireDecisions, numeroDe } from './adr.mjs';
import { MOTIF_ADR, correspond, estActif } from './garde-fou.mjs';

export const CONFIG = '.claude/projectmind.json';
const CLES_CONFIG = ['controle', 'base'];
export const OK = '✓';
export const ATTENTION = '⚠';
export const ECHEC = '✗';
const VERDICTS = { [OK]: 'Prêt', [ATTENTION]: 'Prêt avec réserves', [ECHEC]: 'Non prêt' };

// Motifs de repli quand gitleaks est absent : peu nombreux et ciblés sur des formats précis.
const MOTIFS_SECRETS = [
  ['clé privée', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['clé AWS', /\b(?:AKIA|ASIA)[A-Z2-7]{16}\b/],
  ['jeton GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['jeton Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["clé d'API sk-", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ['clé Google', /\bAIza[0-9A-Za-z_-]{35}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
// Fichiers qui ne devraient jamais être versionnés ; les modèles (.env.example…) sont admis.
const FICHIER_SENSIBLE = /(^|\/)(\.env(\.(?!(example|sample|template|dist)$)[^/]+)?|id_rsa|id_ecdsa|id_ed25519|[^/]+\.(pem|key|p12|pfx|jks))$/i;

function git(racine, args) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: racine, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new ErreurAdr([`git ${args.join(' ')} : ${(r.stderr || r.error?.message || '').trim()}`]);
  return r.stdout;
}

const existe = (racine, ref) => spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: racine }).status === 0;

function baseParDefaut(racine) {
  const r = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: racine, encoding: 'utf8' });
  return [r.status === 0 ? r.stdout.trim() : null, 'main', 'master'].filter(Boolean).find((ref) => existe(racine, ref)) ?? null;
}

export function lireConfig(racine) {
  const chemin = path.join(racine, CONFIG);
  if (!fs.existsSync(chemin)) return { config: {}, erreurs: [] };
  let config;
  try {
    config = JSON.parse(fs.readFileSync(chemin, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    return { config: {}, erreurs: [`${CONFIG} illisible : ${e.message}`] };
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { config: {}, erreurs: [`${CONFIG} doit contenir un objet JSON`] };
  const erreurs = Object.keys(config).filter((k) => !CLES_CONFIG.includes(k)).map((k) => `${CONFIG} : clé inconnue « ${k} »`);
  for (const k of CLES_CONFIG) {
    if (config[k] !== undefined && typeof config[k] !== 'string') {
      erreurs.push(`${CONFIG} : « ${k} » doit être un texte`);
      delete config[k];
    }
  }
  return { config, erreurs };
}

// Fichiers changés entre la base commune et HEAD : [{ statut: A|M|D|T, fichier }].
function lireChangements(racine, base) {
  const champs = git(racine, ['diff', '--name-status', '--no-renames', '-z', base, 'HEAD']).split('\0').filter(Boolean);
  const changements = [];
  for (let k = 0; k + 1 < champs.length; k += 2) changements.push({ statut: champs[k][0], fichier: champs[k + 1] });
  return changements;
}

function sectionControle(racine, controle, sansControle) {
  const titre = 'Commande de contrôle';
  if (sansControle) return { titre, etat: ATTENTION, lignes: ['non lancée (--sans-controle)'] };
  if (!controle) return { titre, etat: ATTENTION, lignes: [`aucune commande déclarée : ajoute « controle » dans ${CONFIG}`] };
  const debut = Date.now();
  const r = spawnSync('bash', ['-c', `{ ${controle}\n} 2>&1`], { cwd: racine, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const duree = Math.round((Date.now() - debut) / 1000);
  if (r.error) return { titre, etat: ECHEC, lignes: [`${controle} : lancement impossible (${r.error.message})`] };
  const sortie = (r.stdout ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const journal = path.join(os.tmpdir(), `projectmind-controle-${Date.now()}.log`);
  fs.writeFileSync(journal, sortie);
  const etat = r.status === 0 ? OK : ECHEC;
  const fin = sortie.trimEnd().split(/\r?\n/).slice(etat === OK ? -8 : -20);
  return {
    titre,
    etat,
    lignes: [`${controle} → code ${r.status ?? r.signal}, ${duree} s`, `journal complet : ${journal}`, ...fin.map((l) => `│ ${l}`)],
  };
}

function sectionAdr(racine, changements, suivis) {
  const adrs = lireDecisions(racine);
  const actifs = adrs.filter(estActif);
  const lignes = [];
  let etat = OK;
  const attention = (ligne) => {
    etat = ATTENTION;
    lignes.push(ligne);
  };
  for (const { statut, fichier } of changements) {
    if (correspond(MOTIF_ADR, fichier)) {
      if (statut === 'A') lignes.push(`ADR ajouté : ${fichier}`);
      else attention(`ADR ${statut === 'D' ? 'supprimé' : 'modifié'} sur la branche : ${fichier} — à relire en PR`);
      continue;
    }
    for (const adr of actifs) {
      const motifs = adr.fichiers_proteges.filter((m) => correspond(m, fichier));
      if (motifs.length) attention(`${fichier} ${statut === 'D' ? 'supprimé' : 'touché'} — protégé par ${adr.id} « ${adr.titre} » (motif : ${motifs.join(', ')})`);
    }
  }
  for (const adr of adrs) {
    for (const e of adr.erreurs) attention(`${adr.fichier} : ${e}`);
  }
  for (const adr of actifs) {
    for (const m of adr.fichiers_proteges) {
      if (!suivis.some((f) => correspond(m, f))) attention(`${adr.id} : le motif « ${m} » ne désigne aucun fichier suivi`);
    }
  }
  const parNumero = new Map();
  for (const adr of adrs) {
    const n = numeroDe(path.posix.basename(adr.fichier));
    parNumero.set(n, [...(parNumero.get(n) ?? []), adr.fichier]);
  }
  for (const [, fichiers] of parNumero) {
    if (fichiers.length > 1) attention(`même numéro pour plusieurs ADR : ${fichiers.join(', ')}`);
  }
  if (etat === OK) {
    lignes.unshift(adrs.length ? `${adrs.length} ADR lus : aucun fichier protégé touché, aucune anomalie` : 'aucun ADR dans docs/decisions/ : rien à contrôler');
  }
  return { titre: 'Décisions (ADR)', etat, lignes };
}

const versionGitleaks = () => {
  const r = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

function secretsParGitleaks(racine, base) {
  const rapport = path.join(os.tmpdir(), `projectmind-gitleaks-${Date.now()}.json`);
  const r = spawnSync('gitleaks', [
    'git', '--no-banner', '--redact', '--exit-code', '0',
    '--report-format', 'json', '--report-path', rapport, `--log-opts=${base}..HEAD`, racine,
  ], { encoding: 'utf8' });
  try {
    if (r.status !== 0) throw new ErreurAdr([`gitleaks a échoué (code ${r.status}) : ${(r.stderr ?? '').trim().split('\n').pop()}`]);
    return JSON.parse(fs.readFileSync(rapport, 'utf8')).map((f) => ({
      fichier: f.File, ligne: f.StartLine, type: f.RuleID, commit: f.Commit?.slice(0, 7),
    }));
  } finally {
    fs.rmSync(rapport, { force: true });
  }
}

// Lignes ajoutées du diff, avec leur numéro dans la version de HEAD.
function secretsParMotifs(racine, base) {
  const trouves = [];
  let fichier = null;
  let ligne = 0;
  for (const l of git(racine, ['diff', '-U0', '--no-color', '--no-ext-diff', base, 'HEAD']).split('\n')) {
    if (l.startsWith('+++ ')) {
      fichier = l.startsWith('+++ b/') ? l.slice(6) : null;
      continue;
    }
    const entete = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (entete) {
      ligne = Number(entete[1]);
      continue;
    }
    if (l.startsWith('+') && fichier) {
      for (const [type, re] of MOTIFS_SECRETS) if (re.test(l)) trouves.push({ fichier, ligne, type });
      ligne++;
    }
  }
  return trouves;
}

function sectionSecrets(racine, base, changements, utiliserGitleaks) {
  const titre = 'Secrets (ce que la branche ajoute)';
  const version = utiliserGitleaks ? versionGitleaks() : null;
  const outil = version ? `gitleaks ${version}` : `motifs intégrés (${MOTIFS_SECRETS.length} types, couverture partielle : gitleaks absent)`;
  const trouves = version ? secretsParGitleaks(racine, base) : secretsParMotifs(racine, base);
  const sensibles = changements.filter((c) => c.statut !== 'D' && FICHIER_SENSIBLE.test(c.fichier));
  if (!trouves.length && !sensibles.length) return { titre, etat: OK, lignes: [`aucun secret trouvé — ${outil}`] };
  return {
    titre,
    etat: ECHEC,
    lignes: [
      `${trouves.length + sensibles.length} alerte(s) — ${outil}. Valeurs masquées : ne pas ouvrir ces lignes pour les lire.`,
      ...sensibles.map((s) => `${s.fichier} — fichier sensible versionné par la branche`),
      ...trouves.map((t) => `${t.fichier}:${t.ligne} — ${t.type}${t.commit ? ` (commit ${t.commit})` : ''}`),
    ],
  };
}

function sectionArbre(racine) {
  const titre = 'Modifications non commitées';
  const n = git(racine, ['status', '--porcelain']).split('\n').filter(Boolean).length;
  if (!n) return { titre, etat: OK, lignes: ['aucune'] };
  return { titre, etat: ATTENTION, lignes: [`${n} fichier(s) : la commande de contrôle les voit, les contrôles ADR et secrets non`] };
}

export function controler(racine, { base, controle, sansControle = false, gitleaks = true } = {}) {
  if (spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: racine }).status !== 0) {
    throw new ErreurAdr([`pas un dépôt git : ${racine}`]);
  }
  const { config, erreurs } = lireConfig(racine);
  const ref = base ?? config.base ?? baseParDefaut(racine);
  if (!ref) throw new ErreurAdr(['aucune base trouvée (ni origin/HEAD, ni main, ni master) : passe --base <ref>']);
  if (!existe(racine, ref)) throw new ErreurAdr([`base introuvable : ${ref}`]);
  const commune = git(racine, ['merge-base', 'HEAD', ref]).trim();
  const changements = lireChangements(racine, commune);
  const suivis = git(racine, ['ls-files', '-z']).split('\0').filter(Boolean);
  // L'état de l'arbre est relevé avant la commande de contrôle, qui peut créer des fichiers.
  const arbre = sectionArbre(racine);
  const sections = [
    ...(erreurs.length ? [{ titre: 'Configuration', etat: ATTENTION, lignes: erreurs }] : []),
    sectionControle(racine, controle ?? config.controle, sansControle),
    sectionAdr(racine, changements, suivis),
    sectionSecrets(racine, commune, changements, gitleaks),
    arbre,
  ];
  const etats = sections.map((s) => s.etat);
  return {
    branche: git(racine, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
    head: git(racine, ['rev-parse', '--short', 'HEAD']).trim(),
    base: ref,
    commune: commune.slice(0, 7),
    commits: Number(git(racine, ['rev-list', '--count', `${commune}..HEAD`]).trim()),
    fichiers: changements.length,
    sections,
    verdict: etats.includes(ECHEC) ? ECHEC : etats.includes(ATTENTION) ? ATTENTION : OK,
  };
}

export function formater(r) {
  const s = [
    `Contrôle avant livraison — ${r.branche} (${r.head}) contre ${r.base} (base commune ${r.commune}) : ${r.commits} commit(s), ${r.fichiers} fichier(s)`,
  ];
  if (!r.commits) s.push(`⚠ la branche n'a aucun commit d'avance sur ${r.base} : rien à comparer`);
  for (const { titre, etat, lignes } of r.sections) s.push('', `${etat} ${titre}`, ...lignes.map((l) => `    ${l}`));
  s.push('', `Verdict : ${r.verdict} ${VERDICTS[r.verdict]}`);
  return `${s.join('\n')}\n`;
}
