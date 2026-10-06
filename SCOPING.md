# ProjectMind — v1 scoping

> Handover from the Maïa session of 2026-10-05. This is the v1 plan; the v2 decisions
> (English, AI-tool independence, distribution) are in ADR-003 to ADR-006.

## Goal

A **generic** Claude Code plugin (for every project) that keeps the memory of a project's
decisions and **warns before one of them is broken**.

**Done when** (MVP = lots 1 to 3): editing a file protected by a decision makes Claude Code
ask for confirmation, citing that decision. Proof: real output shown.

## Decisions taken

| | |
|---|---|
| Scope | generic, for every project |
| Location | this folder, a separate repository, installable through an internal catalog (marketplace) |
| Guard | touching a protected file → **confirmation request** to the user, with the reason and the ADR reference |
| Name | ProjectMind → `/projectmind:…` commands (the prefix is the plugin name) |

## Principles (corrections to the initial proposal)

- **Memory lives in the target project's repository** (`docs/decisions/`), versioned
  and reviewed in PRs. Never in the plugin folder: it is copied to a cache on install.
- **Hooks in Node**, not in `.sh`: there is no `jq` on this machine, and Node reads JSON
  natively and runs everywhere.
- **No made-up figures.** No "27 dependents, 62% tests" without a real analysis of the imports
  or a coverage report. Postponed.
- **Sub-agents on demand only**, never on every change.
- **Claude proposes, the human approves** a decision. Never a "deduced" reason
  written without approval.
- **Do not duplicate an existing register.** A project often already has its decision files
  (e.g. Maïa: the invariants in `README.md`, `docs/etude/06-CICATRICES.md`, `DETTE.md`).
  The plugin must be able to read them, not create a second one.

## Plan in lots

| Lot | Content | Done when… |
|---|---|---|
| 1 | Skeleton: `.claude-plugin/plugin.json`, loaded locally | the plugin shows up in `/plugin` |
| 2 | `/projectmind:remember`: writes `docs/decisions/ADR-NNN-*.md` with, in its front matter, the list of protected files, the reason and the rejected alternatives | an example ADR is created and correctly numbered |
| 3 | `PreToolUse` hook on file edits: if the file is protected by an ADR → confirmation request with the reason | a test sends a fake call to the hook script and checks the output, then a real demo |
| 4 | `/projectmind:why <file>`: decisions and existing sources linked to the file | correct output on a real file |
| 5 | `/projectmind:release-check`: runs the project's check command (e.g. `outillage/verifier.sh` for Maïa), checks the ADRs and the secrets | ✓/⚠/✗ report on a real branch |

Later, only if these lots prove useful: impact analysis, specialized sub-agents.

## First step

Before writing: check in the official Claude Code docs the exact format of
`plugin.json`, of `hooks/hooks.json`, of the `PreToolUse` output that asks for
confirmation, and how to load a plugin locally (`--plugin-dir`?).

## Machine constraints

Windows, Git Bash, no `jq`, CRLF line endings. Git asks for interactive
authentication for push and fetch. No commit or push without explicit agreement in the chat.
