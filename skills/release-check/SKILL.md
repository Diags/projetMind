---
name: release-check
description: ✓/⚠/✗ report before releasing a branch — the project's check command, ADRs touched, secrets in what the branch adds. Fixes nothing.
argument-hint: "[--base <ref>] [--check \"<command>\"] [--no-check]"
disable-model-invocation: true
---

# Release check

Options given: $ARGUMENTS

Fix nothing, commit nothing, push nothing, do not fetch. Reply in the user's language.

1. Run the check, with a 10-minute timeout because the project's command may be long:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/release-check.mjs" --root "${CLAUDE_PROJECT_DIR}" $ARGUMENTS`
   The check command and the base come from `.projectmind.json`, or failing that from
   `.claude/projectmind.json` (`{ "check": "…", "base": "main" }`); the options override them.
2. Show the report as is.
3. For each ✗ and each ⚠, one sentence: what it means, and what to do.
   - To understand a failing command, read the full log given in the report.
   - If the project documents how to read its check command (a skill, `CLAUDE.md`, the `README`),
     for example known failures specific to one machine, apply it and cite the source.
     Without a source, excuse no red.
4. Secrets: never open a reported line, do not read its value, do not repeat it.
   Say where it is, and that it must be revoked and then removed from history.
5. End with the report's verdict, without softening it.
