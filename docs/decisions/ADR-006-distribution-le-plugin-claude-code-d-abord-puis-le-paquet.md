---
id: ADR-006
titre: "Distribution : le plugin Claude Code d'abord, puis le paquet npm projectmind"
statut: acceptée
date: 2026-10-05
fichiers_proteges:
  - ".claude-plugin"
raison: "Publier tôt dans le répertoire Anthropic ; npm donne ensuite une commande npx que tous les outils peuvent lancer, et Node est déjà requis."
alternatives_rejetees:
  - "Le marketplace officiel claude-plugins-official : il est réservé aux partenaires d'Anthropic."
  - "Tout terminer avant de publier : la sortie serait plus tardive."
---

# ADR-006 — Distribution : le plugin Claude Code d'abord, puis le paquet npm projectmind

## Contexte

Le marketplace officiel d'Anthropic n'accepte pas de soumission publique ; le répertoire Anthropic (claude.ai/directory/manage) est ouvert et exige une licence. Le nom projectmind est libre sur npm au 2026-10-05. L'installation depuis le dépôt public Diags/projetMind a été testée le 2026-10-05.

## Options étudiées

_Non renseigné._

## Décision

Phase 1 : le plugin Claude Code, en anglais, sous licence MIT, avec Diaguily SYLLA pour auteur, est soumis au répertoire Anthropic ; notre dépôt reste aussi son propre catalogue. Phase 2 : un paquet npm projectmind, sans dépendance, fournit npx projectmind init et les commandes pour les autres outils.

## Conséquences

Chaque nouvelle version monte le champ version de plugin.json et de package.json. Les gestes publics (push, npm publish, soumission au répertoire) sont faits par le mainteneur.
