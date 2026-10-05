#!/usr/bin/env node
// Outil en ligne de commande de /projectmind:release-check.
//   node release-check.mjs [--racine <dossier>] [--base <ref>] [--controle "<commande>"] [--sans-controle] [--json]
// Code de sortie : 0 si prêt (✓ ou ⚠), 1 si non prêt (✗), 2 si le contrôle n'a pas pu se faire.

import fs from 'node:fs';
import { ErreurAdr } from './lib/adr.mjs';
import { ECHEC, controler, formater } from './lib/release-check.mjs';

try {
  const args = process.argv.slice(2);
  const options = {};
  let racine = process.cwd();
  let json = false;
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--json') json = true;
    else if (args[k] === '--sans-controle') options.sansControle = true;
    else if (args[k] === '--racine' && args[k + 1]) racine = args[++k];
    else if (args[k] === '--base' && args[k + 1]) options.base = args[++k];
    else if (args[k] === '--controle' && args[k + 1]) options.controle = args[++k];
    else throw new ErreurAdr([`option inconnue : ${args[k]}`]);
  }
  if (!fs.existsSync(racine) || !fs.statSync(racine).isDirectory()) {
    throw new ErreurAdr([`dossier du projet introuvable : ${racine}`]);
  }
  const rapport = controler(racine, options);
  process.stdout.write(json ? `${JSON.stringify(rapport, null, 2)}\n` : formater(rapport));
  process.exitCode = rapport.verdict === ECHEC ? 1 : 0;
} catch (e) {
  if (!(e instanceof ErreurAdr)) throw e;
  console.error(`Erreur :\n- ${e.erreurs.join('\n- ')}`);
  process.exitCode = 2;
}
