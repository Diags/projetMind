---
id: ADR-002
titre: "Hooks en Node, pas en shell"
statut: acceptée
date: 2026-10-05
fichiers_proteges: []
raison: "jq est absent du poste de dev ; Node lit le JSON nativement et marche partout."
alternatives_rejetees:
  - "Hooks en shell (.sh) : il faut jq pour lire le JSON, et jq est absent du poste."
---

# ADR-002 — Hooks en Node, pas en shell

## Contexte

Les hooks de ProjectMind doivent lire du JSON. Le poste de dev est sous Windows avec Git Bash, sans jq.

## Options étudiées

_Non renseigné._

## Décision

Les scripts de hook de ProjectMind sont écrits en Node, pas en shell (.sh).

## Conséquences

Pas de dépendance à jq ; le même script marche partout. Node doit être présent sur le poste.
