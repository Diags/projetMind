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
| Guard | Before the AI tool edits a file protected by an ADR, it is stopped with the ADR, its reason and its rejected alternatives. Claude Code and Copilot CLI ask for confirmation; the other tools refuse and tell the agent to ask you (see [the guard in each tool](#the-guard-in-each-tool)). ADR files themselves are protected. |

## What it runs, reads and writes

Everything runs locally, with Node and the project's own tools. The plugin sends nothing over the
network, fetches nothing, and has no telemetry.

- **Runs**: its own Node scripts in `scripts/` and `hooks/`; read-only `git` commands (`ls-files`,
  `log`, `diff`, `status`, `rev-parse`, `rev-list`, `merge-base`, `symbolic-ref`); `gitleaks` when it is
  installed; and, for `/projectmind:release-check` only, the check command the project declares in
  `.projectmind.json` or passes with `--check` (or, when none is declared, its usual test command,
  [detected](#project-setting) from its files), through `bash` at the project root.
- **Reads**: the ADRs in `docs/decisions/`, the `.md` files tracked by git, the project setting
  (`.projectmind.json`, or `.claude/projectmind.json`), and the hook input that Claude Code sends.
- **Writes**: a new ADR in `docs/decisions/`, only after the user's "yes" in
  `/projectmind:remember`; the check command's full log in the system's temporary folder
  (`projectmind-check-*.log`); a temporary gitleaks report, deleted right after reading it; and,
  after `projectmind allow`, the user's time-limited permissions, in the temporary folder too
  (`projectmind-allowed-*.json`).
  Nothing else: it never commits, pushes or edits the project's files. The project's check command
  does what the project wrote it to do, including writing files.

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

1. Bump `version` in `plugin.json` and in `package.json`, to the same value (not in `marketplace.json`).
2. `npm test`, `claude plugin validate . --strict`, and `npm pack --dry-run` to see what npm will publish.
3. Commit, then `claude plugin tag` to set the `projectmind--v<version>` tag, and push.
4. `npm publish`.

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

**Without a declared command**, the release check runs the project's usual test command, taken from
the first of these files that announces one, and the report says which file it came from:

| File | Command |
|---|---|
| `package.json` with a `test` script (npm's placeholder script is ignored) | `npm test`, or `pnpm test`, `yarn test`, `bun run test` when their lockfile is there |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |
| `pytest.ini`, or `[tool.pytest.ini_options]` in `pyproject.toml` | `pytest` |
| `Makefile` with a `test:` target | `make test` |

## Command line, for any AI tool

The npm package `projectmind` runs the same commands without Claude Code: from Codex, Cursor,
Copilot, Gemini CLI or any other tool that can run a shell command, or by hand. It has no dependency.

```bash
npx projectmind@2.0.0 why src/payment.ts
npx projectmind@2.0.0 release-check --no-check
npx projectmind@2.0.0 adr list
echo '{"title": "…", "reason": "…", "context": "…", "decision": "…"}' | npx projectmind@2.0.0 adr create --dry-run
```

`npx projectmind --help` lists every option. The skills and the guard for each tool come with
`npx projectmind init`, in a later version.

## The guard in each tool

Each tool's pre-edit hook runs `projectmind guard <tool>`, which reads the tool's hook input and
answers in that tool's format. Not every tool can ask the user before an edit, so the guard does
the strongest thing each one allows:

| Tool | Hook file | On a protected file | Tested |
|---|---|---|---|
| Claude Code | the plugin's `hooks/hooks.json` | asks for confirmation | contract tests; the hook script run as Claude Code runs it |
| Copilot CLI | `.github/hooks/*.json` | asks for confirmation | contract tests, from the docs |
| Copilot cloud agent | `.github/hooks/*.json` | refuses ("ask" counts as "deny" there) | contract tests, from the docs |
| Codex | `.codex/hooks.json` | refuses, then `projectmind allow` | contract tests, from the docs and Codex's patch grammar |
| Cursor | `.cursor/hooks.json` | refuses, then `projectmind allow` | contract tests, from the docs |
| Gemini CLI | `.gemini/settings.json` | refuses, then `projectmind allow` | contract tests, from the docs |
| VS Code agent | `.github/hooks/*.json` | asks for confirmation, best effort | not tested: its tool names are not documented in what we read |

When a tool refuses, the reason tells the agent to ask you in the chat and, only if you agree, to
run `npx --yes projectmind@<version> allow <file>`: the edit then goes through for 10 minutes
(`--minutes` changes that). An internal error of the guard never blocks the edit: it exits the way
that lets each tool proceed (exit code 0 for Copilot, which blocks on any other code).

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
- **Shell.** A write made through a command (`sed -i`, `>`, `rm`) is not watched, in any tool:
  only the tools' file-editing tools are.
- **Consent.** The guard cannot tell whether you really agreed: `projectmind allow` is a visible
  step that the agent runs, and many tools ask you before running a shell command.
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

## License

[MIT](LICENSE) © 2026 Diaguily SYLLA
