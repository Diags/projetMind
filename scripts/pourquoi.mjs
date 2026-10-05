#!/usr/bin/env node
// Outil en ligne de commande de /projectmind:why.
//   node pourquoi.mjs [--racine <dossier>] [--json] <fichier>

import fs from 'node:fs';
import path from 'node:path';
import { ErreurAdr } from './lib/adr.mjs';
import { formater, pourquoi } from './lib/pourquoi.mjs';

const USAGE = 'Usage : node pourquoi.mjs [--racine <dossier>] [--json] <fichier>';

try {
  const args = process.argv.slice(2);
  let racine = process.cwd();
  let json = false;
  const fichiers = [];
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--json') json = true;
    else if (args[k] === '--racine' && args[k + 1]) racine = args[++k];
    else if (args[k].startsWith('--')) throw new ErreurAdr([`option inconnue : ${args[k]}`]);
    else fichiers.push(args[k]);
  }
  if (fichiers.length !== 1) {
    console.error(USAGE);
    process.exit(2);
  }
  if (!fs.existsSync(racine) || !fs.statSync(racine).isDirectory()) {
    throw new ErreurAdr([`dossier du projet introuvable : ${racine}`]);
  }
  const resultat = pourquoi(racine, path.resolve(racine, fichiers[0]));
  process.stdout.write(json ? `${JSON.stringify(resultat, null, 2)}\n` : formater(resultat));
} catch (e) {
  if (!(e instanceof ErreurAdr)) throw e;
  console.error(`Erreur :\n- ${e.erreurs.join('\n- ')}`);
  process.exitCode = 1;
}
