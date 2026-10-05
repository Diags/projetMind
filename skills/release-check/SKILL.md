---
name: release-check
description: Rapport ✓/⚠/✗ avant de livrer une branche — commande de contrôle du projet, ADR touchés, secrets dans ce que la branche ajoute. Ne corrige rien.
argument-hint: "[--base <ref>] [--controle \"<commande>\"] [--sans-controle]"
disable-model-invocation: true
---

# Contrôle avant livraison

Options données : $ARGUMENTS

Ne corrige rien, ne commite rien, ne pousse rien, ne fais pas de fetch.

1. Lance le contrôle, avec un délai de 10 minutes car la commande du projet peut être longue :
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/release-check.mjs" --racine "${CLAUDE_PROJECT_DIR}" $ARGUMENTS`
   La commande de contrôle et la base viennent de `.projectmind.json`, à défaut de
   `.claude/projectmind.json` (`{ "controle": "…", "base": "main" }`) ; les options les remplacent.
2. Montre le rapport tel quel.
3. Pour chaque ✗ et chaque ⚠, une phrase : ce que ça veut dire, et quoi faire.
   - Pour comprendre un échec de la commande, lis le journal complet indiqué dans le rapport.
   - Si le projet documente comment lire sa commande de contrôle (un skill, `CLAUDE.md`, le `README`),
     par exemple des échecs connus propres à un poste, applique-le en citant la source.
     Sans source, n'excuse aucun rouge.
4. Secrets : n'ouvre jamais une ligne signalée, ne lis pas sa valeur, ne la répète pas.
   Dis où elle est, et qu'il faut la révoquer puis la retirer de l'historique.
5. Termine par le verdict du rapport, sans l'adoucir.
