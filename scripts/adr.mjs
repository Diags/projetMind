#!/usr/bin/env node
// Outil en ligne de commande des ADR, appelé par le skill /projectmind:remember.
//   node adr.mjs lister [--racine <dossier>]
//   node adr.mjs creer [--essai] [--racine <dossier>]    l'ADR arrive en JSON sur stdin

import fs from 'node:fs';
import { creer, lireDecisions, ErreurAdr } from './lib/adr.mjs';

const USAGE = `Usage :
  node adr.mjs lister [--racine <dossier>]
  node adr.mjs creer [--essai] [--racine <dossier>]   (objet JSON sur stdin)`;

function lireOptions(args) {
  const options = { racine: process.cwd(), essai: false };
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--essai') options.essai = true;
    else if (args[k] === '--racine' && args[k + 1]) options.racine = args[++k];
    else throw new ErreurAdr([`option inconnue : ${args[k]}`]);
  }
  if (!fs.existsSync(options.racine) || !fs.statSync(options.racine).isDirectory()) {
    throw new ErreurAdr([`dossier du projet introuvable : ${options.racine}`]);
  }
  return options;
}

try {
  const [commande, ...args] = process.argv.slice(2);
  if (commande === 'lister') {
    const { racine } = lireOptions(args);
    console.log(JSON.stringify(lireDecisions(racine), null, 2));
  } else if (commande === 'creer') {
    const { racine, essai } = lireOptions(args);
    let entree;
    try {
      entree = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      throw new ErreurAdr([`JSON illisible sur stdin : ${e.message}`]);
    }
    const { chemin, contenu } = creer(racine, entree, { essai });
    if (essai) process.stdout.write(`Aperçu, rien n'est écrit : ${chemin}\n\n${contenu}`);
    else console.log(`ADR créé : ${chemin}`);
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
} catch (e) {
  if (!(e instanceof ErreurAdr)) throw e;
  console.error(`Erreur :\n- ${e.erreurs.join('\n- ')}`);
  process.exitCode = 1;
}
