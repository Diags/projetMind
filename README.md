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
| Garde-fou | Avant que Claude modifie un fichier protégé par un ADR, Claude Code demande confirmation en citant l'ADR, sa raison et ses alternatives rejetées. Les fichiers ADR eux-mêmes sont protégés. |

## Installer en local

Prérequis : Node (testé avec la version 24.16).

```bash
cd <ton projet>
claude --plugin-dir <chemin vers ProjetMind>
```

`/plugin` → onglet « Installed » : `projectmind` doit y figurer.
Après une modification du plugin : `/reload-plugins`.

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
- **Erreur du garde-fou.** S'il plante, la modification passe (code 1, message sur stderr) :
  il ne bloque jamais le travail.

## Développer

```bash
node --test                          # tests
claude plugin validate . --strict    # manifeste
claude plugin validate ./skills --strict
```

`docs/decisions/` contient les décisions de ProjectMind lui-même. `CADRAGE.md` donne le plan en lots.
