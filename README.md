# ProjectMind

A Claude Code plugin for any project: it keeps the memory of a project's decisions
and warns before one of them is broken.

The memory lives in the project's own repository, in `docs/decisions/`, versioned and reviewed in PRs
(see [ADR-001](docs/decisions/ADR-001-memory-lives-in-the-target-project-repository.md)).
The plugin itself stores nothing.

## What it does

| | |
|---|---|
| `/projectmind:remember <decision>` | Prepares a numbered ADR (`docs/decisions/ADR-NNN-<slug>.md`), shows a preview, and writes it only after your "yes". Only the user can run this command. |
| `/projectmind:why <file>` | Tells what the project knows about a file: ADRs that protect or cite it, mentions in every `.md` file tracked by git (existing registers, without declaring them), the last 5 commits. Each item gives its source (`DEBT.md:110`, `ADR-001`, hash). Changes nothing. |
| `/projectmind:release-check` | ✓/⚠/✗ report on a branch against its base: the project's check command, protected files and ADRs touched, secrets in what the branch adds (gitleaks when installed, otherwise a few built-in patterns). A secret is never shown, only its file, line and type. Fixes nothing, never fetches. |
| Guard | Before Claude edits a file protected by an ADR, Claude Code asks for confirmation, citing the ADR, its reason and its rejected alternatives. ADR files themselves are protected. |

## Install

This repository is both the plugin and its catalog (`.claude-plugin/marketplace.json`).
Requirement: Node (tested with version 24.16).

```bash
claude plugin marketplace add Diags/projetMind
claude plugin install projectmind@projectmind
```

**For a whole project team**: in that project, run
`claude plugin marketplace add Diags/projetMind --scope project` once, then commit the
`.claude/settings.json` it writes. Every teammate who trusts the folder gets the catalog.

**Updates**: off by default. `claude plugin update projectmind@projectmind`,
or `/plugin` → Marketplaces → projectmind → Enable auto-update.

## Publishing a new version

Teammates only get a new version when `version` changes in
`.claude-plugin/plugin.json`: a commit without a version change does not reach them.

1. Bump `version` in `plugin.json` (not in `marketplace.json`).
2. `node --test` and `claude plugin validate . --strict`.
3. Commit, then `claude plugin tag` to set the `projectmind--v<version>` tag, and push.

## Local development

```bash
cd <your project>
claude --plugin-dir <path to ProjetMind>
```

`/plugin` → "Installed" tab: `projectmind` must be listed.
After changing the plugin: `/reload-plugins`.

## Project setting

`.projectmind.json` at the root, committed with the project. `.claude/projectmind.json` is still read
when it is alone; when both exist, `.projectmind.json` wins and the report says so.

```json
{ "check": "npm test", "base": "main" }
```

`check` runs with `bash` at the project root. Without `base`, the base is `origin/HEAD`,
then `main`, then `master`. The `--check`, `--base` and `--no-check` options of
`/projectmind:release-check` override this setting. The pre-v2 key `controle` is still read as `check`.

## ADR format

Compatible with [MADR 4](https://adr.github.io/madr/) (see ADR-003):

```yaml
---
id: ADR-001
title: "Amounts are whole cents"
status: accepted
date: 2026-10-05
protected_files:
  - "src/payment/**"
  - "**/*.sql"
reason: "Floats round badly; a one-cent gap breaks the reconciliation."
rejected_alternatives:
  - "Decimals as floats: rounding errors"
---
```

Then come the MADR sections: `## Context and Problem Statement`, `## Considered Options`
(when given), `## Decision Outcome` and `### Consequences` (when given).
`id`, `title`, `protected_files`, `reason` and `rejected_alternatives` are ProjectMind's own.

**Pre-v2 ADRs**: the French names (`titre`, `statut`, `fichiers_proteges`, `raison`,
`alternatives_rejetees`) are still read. When a field has both names, the English one is kept
and the anomaly is reported.

**Patterns** (relative to the project root): `*` stays within a folder, `**` crosses
folders, a path without wildcards also covers what it contains. `*.sql` only targets the root,
`**/*.sql` the whole project.

**Status**: an ADR protects as long as its status does not start with `superseded`, `deprecated`
or `rejected` (or, before v2, "remplacée", "abandonnée", "rejetée"). A `proposed` ADR therefore
already protects.

**Hand-written front matter**: bare or quoted strings, dash lists or `[a, b]`,
`>` and `|` blocks, `#` comments. The rest of YAML is not read.

## Known limits

- **Permission mode.** According to the Claude Code docs, the confirmation request becomes a refusal
  in auto mode, and an approval in `bypassPermissions` mode.
- **Shell.** A write made through a command (`sed -i`, `>`, `rm`) is not watched: only the
  Edit, Write, MultiEdit and NotebookEdit tools are.
- **Release check.** The verdict does not know about failures specific to one machine: Claude
  explains them by citing the project's docs. Secrets are only searched in the branch's commits,
  not in uncommitted changes.
- **Guard error.** If the guard crashes, the edit goes through (exit code 1, message on stderr):
  it never blocks the work.

## Development

```bash
node --test                          # tests
claude plugin validate . --strict    # manifest
claude plugin validate ./skills --strict
```

`docs/decisions/` holds ProjectMind's own decisions. `SCOPING.md` gives the v1 plan in lots.
