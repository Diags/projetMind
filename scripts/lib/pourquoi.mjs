// /projectmind:why : ce que le projet sait d'un fichier, chaque élément avec sa source.
// Lit les ADR, tous les .md suivis par git (les registres existants sans les déclarer)
// et les derniers commits qui touchent le fichier. Ne modifie rien.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ErreurAdr, lireDecisions } from './adr.mjs';
import { MOTIF_ADR, cheminRelatif, correspond, estActif } from './garde-fou.mjs';

const NB_COMMITS = 5;
// Du plus sûr au moins sûr : une ligne qui cite le fichier de plusieurs façons garde la plus sûre.
const RANGS = ['chemin', 'fin de chemin', 'nom seul'];

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const extrait = (ligne, max = 200) => {
  const t = ligne.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function git(racine, args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: racine,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function fichiersSuivis(racine) {
  try {
    return git(racine, ['ls-files', '-z']).split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

// Façon dont une ligne cite le fichier : son chemin, une fin de son chemin (auth/prenom.ts),
// ou son nom seul quand aucun autre fichier du dépôt ne le porte. null si elle ne le cite pas.
// Un chemin qui finit par le même nom mais mène ailleurs (config/prenom.ts) ne compte pas.
export function mention(ligne, rel, nomUnique) {
  const nom = path.posix.basename(rel);
  const re = new RegExp(`(?<![\\w./-])[\\w./-]*?${echapper(nom)}(?![\\w-]|\\.\\w)`, 'g');
  let meilleur = null;
  for (const [jeton] of ligne.matchAll(re)) {
    const cite = jeton.replace(/^(\.\/)+/, '');
    let type = null;
    if (cite === rel) type = 'chemin';
    else if (cite.includes('/') && rel.endsWith(`/${cite}`)) type = 'fin de chemin';
    else if (cite === nom && nomUnique) type = 'nom seul';
    if (type && (meilleur === null || RANGS.indexOf(type) < RANGS.indexOf(meilleur))) meilleur = type;
  }
  return meilleur;
}

// Index de la ligne --- qui ferme l'en-tête, ou -1 s'il n'y en a pas.
function finEnTete(lignes) {
  if (lignes[0]?.trim() !== '---') return -1;
  return lignes.findIndex((l, k) => k > 0 && l.trim() === '---');
}

export function pourquoi(racine, fichier) {
  const rel = cheminRelatif(racine, fichier);
  if (!rel) throw new ErreurAdr([`fichier hors du projet : ${fichier}`]);
  const avertissements = [];
  const suivis = fichiersSuivis(racine);
  if (!suivis) avertissements.push('pas un dépôt git : seuls les ADR sont lus, sans historique.');
  const existe = fs.existsSync(path.join(racine, rel));
  if (!existe) avertissements.push(`${rel} est introuvable sur le disque ; la recherche est faite quand même.`);

  const nom = path.posix.basename(rel);
  const homonymes = (suivis ?? []).filter((f) => f !== rel && path.posix.basename(f) === nom).length;

  // Les ADR sont lus même s'ils ne sont pas encore suivis par git.
  const adrs = lireDecisions(racine);
  const aLire = [...new Set([...(suivis ?? []).filter((f) => /\.md$/i.test(f)), ...adrs.map((a) => a.fichier)])]
    .filter((f) => f !== rel);
  const mentions = [];
  for (const f of aLire) {
    const chemin = path.join(racine, f);
    if (!fs.existsSync(chemin)) continue;
    const lignes = fs.readFileSync(chemin, 'utf8').split(/\r?\n/);
    // Dans un ADR, l'en-tête est déjà rendu par « motifs » : on ne lit que le corps.
    const debut = correspond(MOTIF_ADR, f) ? finEnTete(lignes) + 1 : 0;
    for (let k = debut; k < lignes.length; k++) {
      const par = mention(lignes[k], rel, homonymes === 0);
      if (par) mentions.push({ fichier: f, ligne: k + 1, par, texte: extrait(lignes[k]) });
    }
  }

  const decisions = adrs
    .map((adr) => ({
      id: adr.id,
      titre: adr.titre,
      statut: adr.statut,
      actif: estActif(adr),
      fichier: adr.fichier,
      raison: adr.raison,
      motifs: adr.fichiers_proteges.filter((m) => correspond(m, rel)),
      citations: mentions.filter((m) => m.fichier === adr.fichier),
    }))
    .filter((d) => d.motifs.length || d.citations.length);

  let historique = null;
  if (suivis) {
    try {
      historique = git(racine, ['log', `-n${NB_COMMITS}`, '--follow', '--date=short', '--format=%h%x09%ad%x09%s', '--', rel])
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [hash, date, ...titre] = l.split('\t');
          return { hash, date, titre: titre.join('\t') };
        });
    } catch {
      avertissements.push('historique git illisible.');
      historique = [];
    }
  }

  return {
    fichier: rel,
    existe,
    homonymes,
    decisions,
    documentation: mentions.filter((m) => !correspond(MOTIF_ADR, m.fichier)),
    historique,
    avertissements,
  };
}

export function formater(r) {
  const s = [`Pourquoi ${r.fichier} ?`, '', 'Décisions (ADR)'];
  if (!r.decisions.length) s.push('- Aucun ADR ne protège ni ne cite ce fichier.');
  for (const d of r.decisions) {
    const etat = d.actif ? '' : ` (statut : ${d.statut} — ne protège plus)`;
    s.push(`- ${d.id} « ${d.titre} »${etat} — ${d.fichier}`);
    if (d.motifs.length) s.push(`  Protège ce fichier (motif : ${d.motifs.join(', ')})`);
    if (d.raison) s.push(`  Raison : ${d.raison}`);
    for (const c of d.citations) s.push(`  Cité ligne ${c.ligne} [${c.par}] : ${c.texte}`);
  }
  s.push('', 'Mentions dans la documentation (.md suivis par git)');
  if (!r.documentation.length) s.push('- Aucune mention trouvée.');
  for (const m of r.documentation) s.push(`- ${m.fichier}:${m.ligne} [${m.par}] ${m.texte}`);
  if (r.homonymes) {
    const nom = path.posix.basename(r.fichier);
    s.push(`- Nom seul non cherché : ${r.homonymes} autre(s) fichier(s) s'appellent ${nom}.`);
  }
  if (r.historique) {
    s.push('', `Historique git (${NB_COMMITS} derniers commits au plus)`);
    if (!r.historique.length) s.push('- Aucun commit ne touche ce fichier.');
    for (const c of r.historique) s.push(`- ${c.hash} ${c.date} ${c.titre}`);
  }
  if (r.avertissements.length) s.push('', ...r.avertissements.map((a) => `⚠ ${a}`));
  return `${s.join('\n')}\n`;
}
