# ProjectMind — cadrage

> Passation depuis la session Maïa du 05/10/2026. Rien n'est encore écrit.

## But

Un plugin Claude Code **générique** (tous les projets) qui garde la mémoire des
décisions d'un projet et **prévient avant de casser l'une d'elles**.

**C'est fini quand** (MVP = lots 1 à 3) : on édite un fichier protégé par une
décision, et Claude Code demande confirmation en citant cette décision. Preuve :
sortie réelle montrée.

## Décisions prises

| | |
|---|---|
| Portée | générique, pour tous les projets |
| Emplacement | ce dossier, dépôt séparé, installable via un catalogue (marketplace) interne |
| Garde-fou | toucher un fichier protégé → **demande de confirmation** à l'utilisateur, avec la raison et la référence de l'ADR |
| Nom | ProjectMind → commandes `/projectmind:…` (le préfixe = nom du plugin) |

## Principes (corrections de la proposition initiale)

- **La mémoire vit dans le dépôt du projet cible** (`docs/decisions/`), versionnée
  et relue en PR. Jamais dans le dossier du plugin : il est copié en cache à
  l'installation.
- **Hooks en Node**, pas en `.sh` : pas de `jq` sur ce poste, Node lit le JSON
  nativement et marche partout.
- **Aucun chiffre inventé.** Pas de « 27 dépendants, 62 % de tests » sans vraie
  analyse des imports ni rapport de couverture. Repoussé.
- **Sous-agents à la demande seulement**, jamais à chaque modification.
- **Claude propose, l'humain valide** une décision. Jamais de raison « déduite »
  écrite sans validation.
- **Ne pas doubler un registre existant.** Un projet a souvent déjà ses fichiers
  de décisions (ex. Maïa : invariants du `README.md`, `docs/etude/06-CICATRICES.md`,
  `DETTE.md`). Le plugin doit pouvoir les lire, pas en créer un second.

## Plan en lots

| Lot | Contenu | Validé quand… |
|---|---|---|
| 1 | Squelette : `.claude-plugin/plugin.json`, chargé en local | le plugin apparaît dans `/plugin` |
| 2 | `/projectmind:remember` : écrit `docs/decisions/ADR-NNN-*.md` avec en en-tête la liste des fichiers protégés, la raison, les alternatives rejetées | un ADR d'exemple est créé et bien numéroté |
| 3 | Hook `PreToolUse` sur les modifications de fichiers : si le fichier est protégé par un ADR → demande de confirmation avec la raison | un test envoie un faux appel au script du hook et vérifie la sortie, puis démo réelle |
| 4 | `/projectmind:why <fichier>` : décisions et sources existantes liées au fichier | sortie juste sur un vrai fichier |
| 5 | `/projectmind:release-check` : lance la commande de contrôle du projet (ex. `outillage/verifier.sh` pour Maïa), contrôle les ADR et les secrets | rapport ✓/⚠/✗ sur une branche réelle |

Plus tard, seulement si ces lots servent : analyse d'impact, sous-agents spécialisés.

## Premier pas

Avant d'écrire : vérifier dans la doc officielle Claude Code le format exact de
`plugin.json`, de `hooks/hooks.json`, de la sortie `PreToolUse` qui demande
confirmation, et le chargement local d'un plugin (`--plugin-dir` ?).

## Contraintes du poste

Windows, Git Bash, pas de `jq`, fins de ligne CRLF. Git demande une
authentification interactive pour push/fetch. Aucun commit ni push sans accord
explicite dans le chat.
