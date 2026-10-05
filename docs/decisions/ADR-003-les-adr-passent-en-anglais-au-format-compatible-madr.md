---
id: ADR-003
titre: "Les ADR passent en anglais, au format compatible MADR"
statut: acceptée
date: 2026-10-05
fichiers_proteges:
  - "scripts/lib/adr.mjs"
raison: "Le plugin vise un public international (répertoire Anthropic, npm) ; MADR est le format ADR de référence et range déjà ses décisions dans docs/decisions/."
alternatives_rejetees:
  - "Garder notre format en traduisant seulement les noms : pas de standard reconnu."
  - "Rester en français : limite le public hors francophonie."
---

# ADR-003 — Les ADR passent en anglais, au format compatible MADR

## Contexte

Tout le plugin est en français : les champs des ADR (titre, raison, fichiers_proteges, alternatives_rejetees), les statuts (acceptée, remplacée…), les titres de sections, les messages, les skills et la documentation. Il doit être publié dans le répertoire Anthropic puis sur npm.

## Options étudiées

1) Format compatible MADR, en anglais. 2) Notre format, noms traduits. 3) Rester en français.

## Décision

Les ADR écrits par ProjectMind suivent MADR (statut et sections du standard), plus nos champs protected_files, reason et rejected_alternatives. Le nom de fichier reste ADR-NNN-<slug>.md (ADR-001). Le lecteur continue de lire les champs et les statuts français des ADR existants. Les messages, les skills et la documentation passent aussi en anglais.

## Conséquences

Les ADR déjà écrits dans les projets restent lus et continuent de protéger leurs fichiers. Les tests qui vérifient des textes français mot pour mot sont réécrits contre des codes stables. Le format change : la version passe à 2.0.0.
