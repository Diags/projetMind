---
id: ADR-005
title: "The guard asks for consent where the tool allows it, otherwise it refuses with a reason"
status: accepted
date: 2026-10-05
protected_files:
  - "hooks/guard.mjs"
  - "scripts/lib/guard.mjs"
reason: "Only Claude Code, Copilot CLI and VS Code enforce a consent request before a write; Codex and Cursor ignore it, and the edit would then go through silently."
rejected_alternatives:
  - "Return a consent request everywhere: under Codex and Cursor, the edit goes through without a word."
  - "Refuse everywhere: loses the consent request where the tool allows it."
---

# ADR-005 — The guard asks for consent where the tool allows it, otherwise it refuses with a reason

## Context and Problem Statement

According to the official docs as of 2026-10-05: Claude Code, Copilot CLI and VS Code accept ask before a write. Codex reads ask without enforcing it, and passes the patch text instead of the path. Cursor accepts ask in its schema without enforcing it. Gemini CLI has no ask in its hooks. Under Copilot, a crashing hook blocks the tool. No tool watches writes made through the shell.

## Decision Outcome

The guard returns a consent request under Claude Code, Copilot CLI and VS Code. Under Codex, Cursor and Gemini CLI, it refuses with a reason that cites the ADR and tells the agent to ask for consent in the chat; an explicit override then allows the edit. An internal error of the guard always lets the edit through, with a warning. A git pre-commit hook is the common safety net for every tool and for humans.

### Consequences

The README publishes a coverage table, tool by tool. The explicit override is designed in lot 5. Writes made through the shell are only seen by the git pre-commit hook. The paths protected here are updated whenever these files are renamed.
