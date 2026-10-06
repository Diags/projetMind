---
id: ADR-003
title: "ADRs move to English, in a MADR-compatible format"
status: accepted
date: 2026-10-05
protected_files:
  - "scripts/lib/adr.mjs"
reason: "The plugin targets an international audience (Anthropic directory, npm); MADR is the reference ADR format and already keeps its decisions in docs/decisions/."
rejected_alternatives:
  - "Keep our format and only translate the names: no recognized standard."
  - "Stay in French: limits the audience outside French speakers."
---

# ADR-003 — ADRs move to English, in a MADR-compatible format

## Context and Problem Statement

The whole plugin is in French: the ADR fields (titre, raison, fichiers_proteges, alternatives_rejetees), the statuses (acceptée, remplacée…), the section headings, the messages, the skills and the documentation. It must be published in the Anthropic directory, then on npm.

## Considered Options

1) MADR-compatible format, in English. 2) Our format, with translated names. 3) Stay in French.

## Decision Outcome

ADRs written by ProjectMind follow MADR (its status and sections), plus our protected_files, reason and rejected_alternatives fields. The file name stays ADR-NNN-<slug>.md (ADR-001). The reader still reads the French fields and statuses of existing ADRs. Messages, skills and documentation move to English too.

### Consequences

ADRs already written in projects are still read and keep protecting their files. Tests that compare French text word for word are rewritten against stable codes. The format changes: the version moves to 2.0.0.
