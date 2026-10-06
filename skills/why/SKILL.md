---
name: why
description: Montre ce que le projet sait d'un fichier — ADR qui le protègent ou le citent, mentions dans la documentation existante, derniers commits — avec la source de chaque élément.
argument-hint: "<fichier>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/why.mjs" *)
---

# Pourquoi ce fichier ?

Fichier demandé : $ARGUMENTS

Si aucun fichier n'est donné ci-dessus, demande lequel et arrête-toi là.
Ne modifie aucun fichier.

1. Lance la recherche, avec le chemin tel que l'utilisateur l'a donné :
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/why.mjs" --root "${CLAUDE_PROJECT_DIR}" "<fichier>"`
2. Montre la sortie telle quelle.
3. Ajoute un résumé de trois phrases au plus, tiré uniquement de ce que la sortie cite.
   Chaque affirmation renvoie à sa source : `ADR-001`, `DETTE.md:110`, commit `a1b2c3d`.
   Tu peux ouvrir une source citée pour lire le paragraphe autour de la ligne, rien d'autre.
4. Si la sortie ne trouve rien, dis-le en une phrase. N'invente pas de raison et ne la déduis pas du code.
