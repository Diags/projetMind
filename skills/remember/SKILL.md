---
name: remember
description: Enregistre une décision du projet dans docs/decisions/ sous forme d'ADR numéroté, avec les fichiers qu'elle protège, la raison et les alternatives rejetées.
argument-hint: "[décision à enregistrer]"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/adr.mjs" list *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/adr.mjs" create --dry-run *)
---

# Enregistrer une décision

Décision à enregistrer : $ARGUMENTS

Tu proposes, l'utilisateur valide. Rien n'est écrit sans un « oui » explicite de sa part dans le chat.
N'invente ni raison, ni fichier, ni alternative : ce que la conversation ou le dépôt ne dit pas, demande-le.
Ne choisis pas le numéro de l'ADR : le script le calcule.

Si aucune décision n'est donnée ci-dessus, demande laquelle enregistrer et arrête-toi là.

## 1. Vérifier l'existant

- Lis les ADR déjà enregistrés :
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/adr.mjs" list --root "${CLAUDE_PROJECT_DIR}"`
  Si l'un traite déjà du sujet, cite-le et demande s'il faut un nouvel ADR.
- Si le projet tient déjà un registre de décisions ailleurs (invariants, cicatrices, dette… cité dans
  `CLAUDE.md` ou le `README`), signale-le : la décision y figure peut-être déjà. Pas de doublon sans accord.

## 2. Préparer les champs

| Champ | Contenu |
|---|---|
| `title` | La décision en une phrase courte, sur une ligne. |
| `reason` | Pourquoi, en une ou deux phrases. Elle sera montrée à qui touchera un fichier protégé. |
| `protected_files` | Chemins relatifs à la racine du projet ou motifs glob. `*` reste dans un dossier, `**` traverse les dossiers, un chemin sans joker couvre aussi ce qu'il contient : `runtime` protège tout `runtime/`, `*.sql` ne vise que la racine, `**/*.sql` vise tout le projet. Vérifie avec Glob qu'ils désignent des fichiers existants. Liste vide si la décision ne protège aucun fichier. |
| `rejected_alternatives` | Options écartées, chacune suivie de sa raison en quelques mots. Liste vide s'il n'y en a pas. |
| `context` | Le problème qui a mené à la décision. |
| `options` | Les options étudiées. Facultatif. |
| `decision` | Ce qui est décidé, précisément. |
| `consequences` | Effets positifs et négatifs. Facultatif. |

## 3. Montrer l'aperçu

L'aperçu n'écrit rien :

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/adr.mjs" create --dry-run --root "${CLAUDE_PROJECT_DIR}" <<'JSON'
{ "title": "…", "reason": "…", "protected_files": ["…"], "rejected_alternatives": ["…"], "context": "…", "options": "…", "decision": "…", "consequences": "…" }
JSON
```

Montre la sortie telle quelle, puis demande : « J'enregistre cet ADR ? ».
Si l'utilisateur corrige un point, refais l'aperçu avant de redemander.

## 4. Écrire, après accord seulement

Relance la même commande, avec le même JSON, sans `--dry-run`.
Donne le chemin du fichier créé. Ne fais ni commit ni push.
