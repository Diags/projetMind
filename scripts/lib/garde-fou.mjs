// Garde-fou de ProjectMind : retrouve les ADR qui protègent un fichier et rédige le message
// à montrer avant de le modifier. Ne connaît aucun outil d'IA (ADR-004) : chaque adaptateur
// de scripts/lib/adaptateurs/ traduit l'appel de son outil, puis la réponse.

import path from 'node:path';
import { DOSSIER_DECISIONS, lireDecisions, normaliserChemin } from './adr.mjs';

// Un ADR protège tant qu'il n'est pas explicitement inactif : mieux vaut protéger en trop.
const STATUTS_INACTIFS = ['remplacee', 'abandonnee', 'rejetee'];
// Un ADR est lui-même protégé : changer son statut ou ses fichiers retirerait la protection sans rien demander.
export const MOTIF_ADR = `${DOSSIER_DECISIONS}/ADR-*.md`;

const simplifier = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Motifs relatifs à la racine du projet : « * » reste dans un dossier, « ** » traverse
// les dossiers, et un motif sans joker couvre aussi ce qu'il contient.
export function correspond(motif, chemin, sensibleALaCasse = process.platform !== 'win32') {
  const m = normaliserChemin(motif).replace(/\/+$/, '');
  if (!m) return false;
  let re = '';
  for (let k = 0; k < m.length; k++) {
    if (m.startsWith('**/', k)) { re += '(?:.*/)?'; k += 2; }
    else if (m.startsWith('**', k)) { re += '.*'; k += 1; }
    else if (m[k] === '*') re += '[^/]*';
    else if (m[k] === '?') re += '[^/]';
    else re += m[k].replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const contenu = /[*?]/.test(m) ? '' : '(?:/.*)?';
  return new RegExp(`^${re}${contenu}$`, sensibleALaCasse ? '' : 'i').test(chemin);
}

// Chemin du fichier relatif à la racine, ou null s'il est hors du projet.
export function cheminRelatif(racine, fichier) {
  const rel = normaliserChemin(path.relative(racine, path.resolve(racine, fichier)));
  if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return null;
  return rel;
}

export const estActif = (adr) => !STATUTS_INACTIFS.some((s) => simplifier(adr.statut ?? '').startsWith(s));

// Ce que le projet protège dans ce fichier, ou null s'il est libre ou hors du projet.
// Rend { fichier (relatif), estUnAdr, touchees: [{ adr, motifs }], message }.
export function protections(racine, fichier) {
  if (typeof fichier !== 'string' || !fichier) return null;
  const rel = cheminRelatif(racine, fichier);
  if (!rel) return null;
  const estUnAdr = correspond(MOTIF_ADR, rel);
  const touchees = lireDecisions(racine)
    .filter(estActif)
    .map((adr) => ({ adr, motifs: adr.fichiers_proteges.filter((m) => correspond(m, rel)) }))
    .filter((t) => t.motifs.length);
  if (!estUnAdr && !touchees.length) return null;
  return { fichier: rel, estUnAdr, touchees, message: rediger(rel, estUnAdr, touchees) };
}

function rediger(rel, estUnAdr, touchees) {
  const blocs = touchees.map(({ adr, motifs }) => [
    `${adr.id ?? '?'} — ${adr.titre ?? '(sans titre)'} [motif : ${motifs.join(', ')}]`,
    `Raison : ${adr.raison ?? '(non renseignée)'}`,
    ...(adr.alternatives_rejetees.length ? [`Alternatives rejetées : ${adr.alternatives_rejetees.join(' ; ')}`] : []),
    ...(adr.erreurs.length ? [`⚠ ADR à corriger : ${adr.erreurs.join(' ; ')}`] : []),
    `Source : ${adr.fichier}`,
  ].join('\n'));
  return [
    `ProjectMind : ${rel} est protégé par une décision.`,
    ...(estUnAdr ? ['Ce fichier est un ADR : le modifier change une décision enregistrée (son statut, ses fichiers protégés…). Confirme seulement si la décision a été revue.'] : []),
    ...blocs,
    ...(touchees.length ? ["Confirme seulement si tu reviens sur cette décision, et mets alors l'ADR à jour."] : []),
  ].join('\n\n');
}
