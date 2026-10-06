---
id: ADR-001
title: "Memory lives in the target project repository"
status: accepted
date: 2026-10-05
protected_files:
  - "scripts/lib/adr.mjs"
reason: "The plugin folder is copied to a cache on install; decisions must live in the project's docs/decisions/, versioned and reviewed in PRs."
rejected_alternatives:
  - "In the plugin folder: it is copied to a cache on install."
  - "In .projectmind/ (the study's proposal): a second register next to the project's own."
---

# ADR-001 — Memory lives in the target project repository

## Context and Problem Statement

ProjectMind keeps the memory of a project's decisions. We must choose where this memory is stored.

## Decision Outcome

ADRs are written in the target project's docs/decisions/, as ADR-NNN-<slug>.md. The plugin stores nothing there.

### Consequences

Decisions are versioned and reviewed in PRs along with the code. If the project already keeps a register, the plugin must read it rather than create a second one.
