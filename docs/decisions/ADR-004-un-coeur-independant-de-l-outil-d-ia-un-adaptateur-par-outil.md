---
id: ADR-004
titre: "Un cœur indépendant de l'outil d'IA, un adaptateur par outil"
statut: acceptée
date: 2026-10-05
fichiers_proteges: []
raison: "ProjectMind doit marcher avec Claude Code, Copilot, Codex, Cursor et Gemini CLI ; chacun a son format de hook, ses noms d'outils et ses dossiers."
alternatives_rejetees:
  - "Rester un plugin Claude Code seulement : exclut Codex, Cursor et les autres outils."
---

# ADR-004 — Un cœur indépendant de l'outil d'IA, un adaptateur par outil

## Contexte

Le cœur (scripts/lib/) ne lit déjà aucune variable de Claude Code et ses commandes marchent depuis un terminal. Deux exceptions : le garde-fou connaît les noms d'outils de Claude (Edit, Write…) et produit sa réponse au format de Claude ; le réglage du projet est cherché dans .claude/projectmind.json.

## Options étudiées

_Non renseigné._

## Décision

Le cœur ne connaît ni les noms d'outils ni les formats de réponse d'un outil d'IA : il reçoit une racine et des chemins, et rend des décisions. Chaque outil a un petit adaptateur qui traduit son entrée et sa sortie. Le réglage du projet passe dans .projectmind.json, avec repli sur .claude/projectmind.json.

## Conséquences

Ajouter un outil revient à écrire un adaptateur, sans toucher au cœur. Les tests du cœur ne dépendent d'aucun outil.
