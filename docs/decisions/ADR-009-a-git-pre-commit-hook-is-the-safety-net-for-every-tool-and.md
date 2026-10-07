---
id: ADR-009
title: "A git pre-commit hook is the safety net for every tool and for humans"
status: accepted
date: 2026-10-07
protected_files:
  - "scripts/lib/precommit.mjs"
  - "scripts/check-staged.mjs"
reason: "No tool's hook sees a write made through a shell command, nor a human's edit; a commit sees them all."
rejected_alternatives: []
---

# ADR-009 — A git pre-commit hook is the safety net for every tool and for humans

## Context and Problem Statement

ADR-005 names a git pre-commit hook as the common safety net. Hooks in .git/hooks/ are not versioned, and many projects already use a hook manager through core.hooksPath, such as husky.

## Decision Outcome

In a git repository, init installs .git/hooks/pre-commit, which runs `projectmind check-staged`: a commit that changes a file protected by an active ADR is refused, with the ADR and its reason, until the user runs projectmind allow. New and changed ADR files pass: the release check lists them for review. init never replaces an existing hook or another hook manager: it prints the line to add instead. An internal error lets the commit through, with a warning.

### Consequences

The hook stays in the clone: each teammate runs init for it, and git commit --no-verify skips it. The guarantee remains the review: the release check in CI and code owners for the protected files.
