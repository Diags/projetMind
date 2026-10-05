// Lecture et écriture des ADR de ProjectMind : docs/decisions/ADR-NNN-<slug>.md.
// Sans dépendance. L'en-tête est un sous-ensemble de YAML (voir analyserEnTete) :
// le script écrit toujours les textes entre guillemets, un humain peut les retirer.

import fs from 'node:fs';
import path from 'node:path';

export const DOSSIER_DECISIONS = 'docs/decisions';
const MOTIF_NOM = /^ADR-(\d+)-.+\.md$/i;
const CHAMPS_TEXTE = ['titre', 'raison', 'contexte', 'options', 'decision', 'consequences'];
const CHAMPS_LISTE = ['fichiers_proteges', 'alternatives_rejetees'];
const OBLIGATOIRES = ['titre', 'raison', 'contexte', 'decision'];

export class ErreurAdr extends Error {
  constructor(erreurs) {
    super(erreurs.join('\n'));
    this.erreurs = erreurs;
  }
}

export function slugifier(titre, max = 60) {
  const base = titre
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base || 'decision';
  // Coupe au dernier tiret avant la limite pour ne pas tronquer un mot.
  const coupe = base.slice(0, max + 1);
  const tiret = coupe.lastIndexOf('-');
  return tiret > 0 ? coupe.slice(0, tiret) : base.slice(0, max);
}

export function numeroDe(nom) {
  const m = MOTIF_NOM.exec(nom);
  return m ? Number(m[1]) : null;
}

// Le suivant du plus grand numéro : un trou dans la suite n'est jamais réutilisé.
export function prochainNumero(noms) {
  let max = 0;
  for (const nom of noms) {
    const n = numeroDe(nom);
    if (n !== null && n > max) max = n;
  }
  return max + 1;
}

export function formaterId(n) {
  return `ADR-${String(n).padStart(3, '0')}`;
}

export function dateDuJour(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Chemin relatif à la racine du projet, séparateur « / », sans « ./ » en tête.
export function normaliserChemin(chemin) {
  return chemin.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

function preparer(entree) {
  if (entree === null || typeof entree !== 'object' || Array.isArray(entree)) {
    return { erreurs: ["l'entrée doit être un objet JSON"] };
  }
  const erreurs = [];
  const adr = {};
  for (const cle of Object.keys(entree)) {
    if (!CHAMPS_TEXTE.includes(cle) && !CHAMPS_LISTE.includes(cle)) erreurs.push(`clé inconnue : « ${cle} »`);
  }
  for (const cle of CHAMPS_TEXTE) {
    const v = entree[cle] ?? '';
    if (typeof v !== 'string') erreurs.push(`« ${cle} » doit être un texte`);
    adr[cle] = typeof v === 'string' ? v.trim() : '';
    if (OBLIGATOIRES.includes(cle) && !adr[cle] && typeof v === 'string') erreurs.push(`« ${cle} » est obligatoire`);
  }
  if (/[\r\n]/.test(adr.titre)) erreurs.push('« titre » doit tenir sur une ligne');
  for (const cle of CHAMPS_LISTE) {
    const v = entree[cle] ?? [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) {
      erreurs.push(`« ${cle} » doit être une liste de textes non vides`);
      adr[cle] = [];
    } else {
      adr[cle] = v.map((x) => x.trim());
    }
  }
  adr.fichiers_proteges = [...new Set(adr.fichiers_proteges.map(normaliserChemin))];
  for (const f of adr.fichiers_proteges) {
    if (path.posix.isAbsolute(f) || /^[A-Za-z]:/.test(f) || f.split('/').includes('..')) {
      erreurs.push(`chemin hors du projet : « ${f} » (donne un chemin relatif à la racine)`);
    }
  }
  return { adr, erreurs };
}

export function serialiser(id, adr, date) {
  const q = (s) => JSON.stringify(s);
  const liste = (cle, valeurs) => (valeurs.length ? [`${cle}:`, ...valeurs.map((v) => `  - ${q(v)}`)] : [`${cle}: []`]);
  const section = (titre, texte) => [`## ${titre}`, '', texte || '_Non renseigné._', ''];
  return [
    '---',
    `id: ${id}`,
    `titre: ${q(adr.titre)}`,
    'statut: acceptée',
    `date: ${date}`,
    ...liste('fichiers_proteges', adr.fichiers_proteges),
    `raison: ${q(adr.raison)}`,
    ...liste('alternatives_rejetees', adr.alternatives_rejetees),
    '---',
    '',
    `# ${id} — ${adr.titre}`,
    '',
    ...section('Contexte', adr.contexte),
    ...section('Options étudiées', adr.options),
    ...section('Décision', adr.decision),
    ...section('Conséquences', adr.consequences),
  ].join('\n');
}

// Calcule le numéro, écrit le fichier (sauf en essai) et rend { id, chemin, contenu }.
export function creer(racine, entree, { essai = false, date = dateDuJour() } = {}) {
  const { adr, erreurs } = preparer(entree);
  if (erreurs.length) throw new ErreurAdr(erreurs);
  const dossier = path.join(racine, DOSSIER_DECISIONS);
  const noms = fs.existsSync(dossier) ? fs.readdirSync(dossier) : [];
  const id = formaterId(prochainNumero(noms));
  const nom = `${id}-${slugifier(adr.titre)}.md`;
  const contenu = serialiser(id, adr, date);
  if (!essai) {
    fs.mkdirSync(dossier, { recursive: true });
    try {
      fs.writeFileSync(path.join(dossier, nom), contenu, { flag: 'wx' });
    } catch (e) {
      if (e.code === 'EEXIST') throw new ErreurAdr([`le fichier existe déjà : ${DOSSIER_DECISIONS}/${nom}`]);
      throw e;
    }
  }
  return { id, chemin: `${DOSSIER_DECISIONS}/${nom}`, contenu };
}

// Sous-ensemble de YAML lu dans l'en-tête :
//   cle: valeur            texte nu, "entre guillemets" ou 'entre apostrophes'
//   cle: suite             un texte nu peut continuer sur les lignes indentées suivantes
//   cle: [a, "b"]          liste sur une ligne
//   cle:                   liste en tirets, indentée ou non
//     - a
//   cle: >   ou   cle: |   bloc plié ou littéral
//   # commentaire
// Rend { donnees, erreurs } ; donnees vaut null s'il n'y a pas d'en-tête.
export function analyserEnTete(texte) {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/);
  if (lignes[0].trim() !== '---') return { donnees: null, erreurs: ["pas d'en-tête : la première ligne doit être ---"] };
  const fin = lignes.findIndex((l, k) => k > 0 && l.trim() === '---');
  if (fin < 0) return { donnees: null, erreurs: ["en-tête non fermé : il manque la ligne --- de fin"] };

  const donnees = {};
  const erreurs = [];
  let i = 1;
  while (i < fin) {
    if (estIgnorable(lignes[i])) { i++; continue; }
    const m = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*?))?\s*$/.exec(lignes[i]);
    if (!m) {
      erreurs.push(`ligne ${i + 1} illisible : ${lignes[i].trim()}`);
      i++;
      continue;
    }
    const [, cle, valeur = ''] = m;
    i++;
    const suite = [];
    while (i < fin && (/^\s/.test(lignes[i]) || lignes[i] === '' || (valeur === '' && /^-(\s|$)/.test(lignes[i])))) {
      suite.push(lignes[i]);
      i++;
    }
    const utiles = suite.filter((l) => !estIgnorable(l));
    if (/^[|>][+-]?$/.test(valeur)) {
      donnees[cle] = lireBloc(valeur[0], suite);
    } else if (valeur === '') {
      donnees[cle] = utiles.length && /^-(\s|$)/.test(utiles[0].trim())
        ? lireListe(utiles)
        : lireScalaire(utiles.map((l) => l.trim()).join(' '));
    } else {
      const brut = [valeur, ...utiles.map((l) => l.trim())].join(' ');
      donnees[cle] = brut.startsWith('[') ? lireListeEnLigne(brut, erreurs, cle) : lireScalaire(brut);
    }
  }
  return { donnees, erreurs };
}

function estIgnorable(ligne) {
  return /^\s*(#.*)?$/.test(ligne);
}

function lireScalaire(brut) {
  const s = brut.trim();
  if (s.startsWith('"')) {
    let k = 1;
    while (k < s.length && s[k] !== '"') k += s[k] === '\\' ? 2 : 1;
    try {
      return JSON.parse(s.slice(0, k + 1));
    } catch {
      return s.slice(1, k);
    }
  }
  if (s.startsWith("'")) {
    let sortie = '';
    for (let k = 1; k < s.length; k++) {
      if (s[k] !== "'") sortie += s[k];
      else if (s[k + 1] === "'") { sortie += "'"; k++; }
      else break;
    }
    return sortie;
  }
  return s.replace(/\s+#.*$/, '');
}

function lireListe(lignes) {
  const elements = [];
  for (const l of lignes) {
    const t = l.trim();
    if (/^-(\s|$)/.test(t)) elements.push(t.slice(1).trim());
    else elements[elements.length - 1] += ` ${t}`;
  }
  return elements.map(lireScalaire);
}

function lireListeEnLigne(brut, erreurs, cle) {
  const elements = [];
  let courant = '';
  let guillemet = null;
  let k = 1;
  for (; k < brut.length; k++) {
    const c = brut[k];
    if (guillemet) {
      courant += c;
      if (c === '\\' && guillemet === '"') courant += brut[++k] ?? '';
      else if (c === guillemet) guillemet = null;
    } else if (c === '"' || c === "'") {
      guillemet = c;
      courant += c;
    } else if (c === ',') {
      elements.push(courant);
      courant = '';
    } else if (c === ']') {
      break;
    } else {
      courant += c;
    }
  }
  if (k >= brut.length) erreurs.push(`« ${cle} » : liste non fermée`);
  elements.push(courant);
  return elements.map((e) => e.trim()).filter((e) => e !== '').map(lireScalaire);
}

function lireBloc(type, suite) {
  const lignes = [...suite];
  while (lignes.length && !lignes[lignes.length - 1].trim()) lignes.pop();
  const retrait = Math.min(...lignes.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length));
  const texte = lignes.map((l) => l.slice(retrait));
  if (type === '|') return texte.join('\n');
  return texte.join('\n').split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).join(' ')).join('\n');
}

// Lit tous les ADR du projet, triés par numéro. Une anomalie est signalée dans
// « erreurs » sans faire disparaître la décision : mieux vaut protéger en trop.
export function lireDecisions(racine) {
  const dossier = path.join(racine, DOSSIER_DECISIONS);
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier)
    .filter((nom) => MOTIF_NOM.test(nom))
    .sort((a, b) => numeroDe(a) - numeroDe(b))
    .map((nom) => {
      const { donnees, erreurs } = analyserEnTete(fs.readFileSync(path.join(dossier, nom), 'utf8'));
      const d = { ...donnees };
      for (const cle of CHAMPS_LISTE) {
        if (d[cle] === undefined || d[cle] === '') d[cle] = [];
        else if (!Array.isArray(d[cle])) {
          erreurs.push(`« ${cle} » devrait être une liste`);
          d[cle] = [d[cle]];
        }
      }
      d.fichiers_proteges = d.fichiers_proteges.map(normaliserChemin);
      if (donnees && !d.raison) erreurs.push('« raison » manquante');
      const attendu = formaterId(numeroDe(nom));
      if (donnees && d.id !== attendu) erreurs.push(`« id » vaut ${d.id ?? '(rien)'} mais le nom du fichier donne ${attendu}`);
      return { fichier: `${DOSSIER_DECISIONS}/${nom}`, ...d, erreurs };
    });
}
