---
id: ADR-001
titre: "La mémoire vit dans le dépôt du projet cible"
statut: acceptée
date: 2026-10-05
fichiers_proteges:
  - "scripts/lib/adr.mjs"
raison: "Le dossier du plugin est copié en cache à l'installation ; les décisions doivent vivre dans docs/decisions/ du projet, versionnées et relues en PR."
alternatives_rejetees:
  - "Dans le dossier du plugin : il est copié en cache à l'installation."
  - "Dans .projectmind/ (proposition de l'étude) : un second registre à côté de ceux du projet."
---

# ADR-001 — La mémoire vit dans le dépôt du projet cible

## Contexte

ProjectMind garde la mémoire des décisions d'un projet. Il faut choisir où cette mémoire est stockée.

## Options étudiées

_Non renseigné._

## Décision

Les ADR sont écrits dans docs/decisions/ du projet cible, sous la forme ADR-NNN-<slug>.md. Le plugin n'y stocke rien.

## Conséquences

Les décisions sont versionnées et relues en PR avec le code. Si le projet tient déjà un registre, le plugin doit le lire plutôt qu'en créer un second.
