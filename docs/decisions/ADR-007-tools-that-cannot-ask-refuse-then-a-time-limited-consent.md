---
id: ADR-007
title: "Tools that cannot ask: refuse, then a time-limited consent with projectmind allow"
status: accepted
date: 2026-10-07
protected_files:
  - "scripts/lib/consent.mjs"
  - "scripts/allow.mjs"
reason: "Codex, Cursor and Gemini CLI cannot ask the user before an edit; an explicit, visible step must stand for the user's yes."
rejected_alternatives: []
---

# ADR-007 — Tools that cannot ask: refuse, then a time-limited consent with projectmind allow

## Context and Problem Statement

Under Codex, Cursor and Gemini CLI, the guard refuses an edit of a protected file with a reason that cites the ADR (ADR-005). The agent then needs a way to go ahead once the user agrees.

## Decision Outcome

The refusal tells the agent to ask the user in the chat and, only if they agree, to run `npx --yes @diags/projectmind@<version> allow <file>`. The edit of that file then goes through for 10 minutes; --minutes changes the duration. The permission is kept in the system's temporary folder, one file per project, never in the repository. The pre-commit hook honours the same permission.

### Consequences

The guard cannot tell whether the user really agreed: allow is a visible step that the agent runs, and many tools ask before running a shell command. Permissions disappear with the temporary folder and do not follow the project to another machine.
