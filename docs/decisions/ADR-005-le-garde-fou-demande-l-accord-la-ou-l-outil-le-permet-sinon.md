---
id: ADR-005
titre: "Le garde-fou demande l'accord là où l'outil le permet, sinon il refuse avec un motif"
statut: acceptée
date: 2026-10-05
fichiers_proteges:
  - "hooks/garde-fou.mjs"
  - "scripts/lib/garde-fou.mjs"
raison: "Seuls Claude Code, Copilot CLI et VS Code appliquent une demande d'accord avant écriture ; Codex et Cursor l'ignorent, et la modification passerait alors en silence."
alternatives_rejetees:
  - "Renvoyer une demande d'accord partout : sous Codex et Cursor, la modification passe sans rien dire."
  - "Refuser partout : perd la demande d'accord là où l'outil la permet."
---

# ADR-005 — Le garde-fou demande l'accord là où l'outil le permet, sinon il refuse avec un motif

## Contexte

D'après les docs officielles au 2026-10-05 : Claude Code, Copilot CLI et VS Code acceptent ask avant une écriture. Codex lit ask sans l'appliquer, et passe le texte du patch au lieu du chemin. Cursor accepte ask dans son schéma sans l'appliquer. Gemini CLI n'a pas d'ask dans ses hooks. Sous Copilot, un hook qui plante bloque l'outil. Aucun outil ne surveille les écritures faites par le shell.

## Options étudiées

_Non renseigné._

## Décision

Le garde-fou renvoie une demande d'accord sous Claude Code, Copilot CLI et VS Code. Sous Codex, Cursor et Gemini CLI, il refuse avec un motif qui cite l'ADR et dit à l'agent de demander l'accord dans le chat ; une levée explicite permet ensuite la modification. Une erreur interne du garde-fou laisse toujours passer la modification, avec un avertissement. Un hook git avant commit sert de filet commun à tous les outils et aux humains.

## Conséquences

Le README publie un tableau de couverture, outil par outil. La levée explicite est conçue au lot 5. Les écritures faites par le shell ne sont vues que par le hook git avant commit. Les chemins protégés ici seront mis à jour si ces fichiers sont renommés lors de la traduction.
