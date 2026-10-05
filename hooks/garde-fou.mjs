#!/usr/bin/env node
// Hook PreToolUse de ProjectMind, déclaré dans hooks/hooks.json.
// Fichier protégé par un ADR actif → demande de confirmation ; sinon rien, l'outil suit son cours.
// En cas d'erreur, le code 1 laisse l'outil suivre son cours : le garde-fou ne bloque jamais le travail.

import fs from 'node:fs';
import { decider } from '../scripts/lib/garde-fou.mjs';

try {
  const entree = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, ''));
  const racine = process.env.CLAUDE_PROJECT_DIR || entree.cwd || process.cwd();
  const sortie = decider(entree, racine);
  if (sortie) process.stdout.write(JSON.stringify(sortie));
} catch (e) {
  console.error(`ProjectMind : garde-fou en erreur, modification non vérifiée : ${e.message}`);
  process.exitCode = 1;
}
