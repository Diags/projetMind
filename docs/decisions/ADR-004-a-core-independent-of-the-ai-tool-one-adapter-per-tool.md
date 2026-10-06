---
id: ADR-004
title: "A core independent of the AI tool, one adapter per tool"
status: accepted
date: 2026-10-05
protected_files: []
reason: "ProjectMind must work with Claude Code, Copilot, Codex, Cursor and Gemini CLI; each has its own hook format, tool names and folders."
rejected_alternatives:
  - "Stay a Claude Code plugin only: leaves out Codex, Cursor and the other tools."
---

# ADR-004 — A core independent of the AI tool, one adapter per tool

## Context and Problem Statement

The core (scripts/lib/) already reads no Claude Code variable, and its commands run from a terminal. Two exceptions: the guard knows Claude's tool names (Edit, Write…) and produces its answer in Claude's format; the project setting is looked up in .claude/projectmind.json.

## Decision Outcome

The core knows neither the tool names nor the answer formats of any AI tool: it receives a root and paths, and returns decisions. Each tool has a small adapter that translates its input and output. The project setting moves to .projectmind.json, falling back to .claude/projectmind.json.

### Consequences

Adding a tool means writing an adapter, without touching the core. The core's tests depend on no tool.
