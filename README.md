# ProjectMind

Plugin Claude Code, pour tous les projets : il garde la mémoire des décisions d'un projet
et prévient avant de casser l'une d'elles.

La mémoire vit dans le dépôt du projet, dans `docs/decisions/`, versionnée et relue en PR
(voir [ADR-001](docs/decisions/ADR-001-la-memoire-vit-dans-le-depot-du-projet-cible.md)).
Le plugin, lui, ne stocke rien.

## Ce qu'il fait

| | |
|---|---|
| `/projectmind:remember <décision>` | Prépare un ADR numéroté (`docs/decisions/ADR-NNN-<slug>.md`), en montre l'aperçu, et ne l'écrit qu'après ton « oui ». Seul l'utilisateur peut lancer cette commande. |
| `/projectmind:why <fichier>` | Dit ce que le projet sait d'un fichier : ADR qui le protègent ou le citent, mentions dans tous les `.md` suivis par git (les registres existants, sans les déclarer), 5 derniers commits. Chaque élément donne sa source (`DETTE.md:110`, `ADR-001`, hash). Ne modifie rien. |
| `/projectmind:release-check` | Rapport ✓/⚠/✗ d'une branche contre sa base : commande de contrôle du projet, fichiers protégés et ADR touchés, secrets dans ce que la branche ajoute (gitleaks s'il est installé, sinon quelques motifs intégrés). Un secret n'est jamais affiché, seulement son fichier, sa ligne et son type. Ne corrige rien, ne fait aucun fetch. |
| Garde-fou | Avant que Claude modifie un fichier protégé par un ADR, Claude Code demande confirmation en citant l'ADR, sa raison et ses alternatives rejetées. Les fichiers ADR eux-mêmes sont protégés. |

## Installer depuis le catalogue interne

Ce dépôt est à la fois le plugin et son catalogue (`.claude-plugin/marketplace.json`).
Prérequis : Node (testé avec la version 24.16) et un accès en lecture au dépôt GitHub.

```bash
claude plugin marketplace add Diags/projetMind
claude plugin install projectmind@projectmind
```

Le dépôt est privé : git doit déjà avoir un identifiant enregistré, car Claude Code n'en
demande pas. Sur GitHub : `gh auth login` puis `gh auth setup-git`. Sans clé SSH GitHub,
définir `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` avant l'ajout.

**Pour toute l'équipe d'un projet** : dans ce projet, lancer une fois
`claude plugin marketplace add Diags/projetMind --scope project`, puis commiter le
`.claude/settings.json` écrit. Chaque collègue qui fait confiance au dossier reçoit le catalogue.

**Mises à jour** : désactivées par défaut. `claude plugin update projectmind@projectmind`,
ou `/plugin` → Marketplaces → projectmind → Enable auto-update.

## Publier une nouvelle version

Les collègues ne reçoivent une nouvelle version que si `version` change dans
`.claude-plugin/plugin.json` : un commit sans changement de version ne leur parvient pas.

1. Monter `version` dans `plugin.json` (pas dans `marketplace.json`).
2. `node --test` et `claude plugin validate . --strict`.
3. Commiter, puis `claude plugin tag` pour poser le tag `projectmind--v<version>`, et pousser.

## Développer en local

```bash
cd <ton projet>
claude --plugin-dir <chemin vers ProjetMind>
```

`/plugin` → onglet « Installed » : `projectmind` doit y figurer.
Après une modification du plugin : `/reload-plugins`.

## Réglage du projet

`.claude/projectmind.json`, versionné avec le projet :

```json
{ "controle": "PYTHONUTF8=1 ./outillage/verifier.sh tests", "base": "main" }
```

`controle` est lancé avec `bash` à la racine du projet. Sans `base`, la base est `origin/HEAD`,
puis `main`, puis `master`. Les options `--controle`, `--base` et `--sans-controle` de
`/projectmind:release-check` remplacent ce réglage.

## Format d'un ADR

```yaml
---
id: ADR-001
titre: "Les montants sont en centimes entiers"
statut: acceptée
date: 2026-10-05
fichiers_proteges:
  - "src/paiement/**"
  - "**/*.sql"
raison: "Les flottants arrondissent mal ; un écart d'un centime casse le rapprochement."
alternatives_rejetees:
  - "Décimaux en flottant : erreurs d'arrondi"
---
```

Suivent les sections Contexte, Options étudiées, Décision et Conséquences.

**Motifs** (relatifs à la racine du projet) : `*` reste dans un dossier, `**` traverse les
dossiers, un chemin sans joker couvre aussi ce qu'il contient. `*.sql` ne vise que la racine,
`**/*.sql` tout le projet.

**Statut** : un ADR protège tant que son statut ne commence pas par « remplacée »,
« abandonnée » ou « rejetée ».

**En-tête écrit à la main** : textes nus ou entre guillemets, listes en tirets ou `[a, b]`,
blocs `>` et `|`, commentaires `#`. Le reste du YAML n'est pas lu.

## Limites connues

- **Mode de permission.** Selon la doc Claude Code, la demande de confirmation devient un refus
  en mode auto, et une autorisation en mode `bypassPermissions`.
- **Shell.** Une écriture par commande (`sed -i`, `>`, `rm`) n'est pas surveillée : seuls les
  outils Edit, Write, MultiEdit et NotebookEdit le sont.
- **Contrôle avant livraison.** Le verdict ne connaît pas les échecs propres à un poste : c'est à
  Claude de les expliquer en citant la doc du projet. Les secrets ne sont cherchés que dans les
  commits de la branche, pas dans les modifications non commitées.
- **Erreur du garde-fou.** S'il plante, la modification passe (code 1, message sur stderr) :
  il ne bloque jamais le travail.

## Développer

```bash
node --test                          # tests
claude plugin validate . --strict    # manifeste
claude plugin validate ./skills --strict
```

`docs/decisions/` contient les décisions de ProjectMind lui-même. `CADRAGE.md` donne le plan en lots.
