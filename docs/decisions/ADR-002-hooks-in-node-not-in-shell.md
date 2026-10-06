---
id: ADR-002
title: "Hooks in Node, not in shell"
status: accepted
date: 2026-10-05
protected_files: []
reason: "jq is missing on the dev machine; Node reads JSON natively and runs everywhere."
rejected_alternatives:
  - "Shell hooks (.sh): reading JSON needs jq, and jq is missing on the machine."
---

# ADR-002 — Hooks in Node, not in shell

## Context and Problem Statement

ProjectMind's hooks must read JSON. The dev machine runs Windows with Git Bash, without jq.

## Decision Outcome

ProjectMind's hook scripts are written in Node, not in shell (.sh).

### Consequences

No dependency on jq; the same script runs everywhere. Node must be installed on the machine.
