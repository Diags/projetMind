---
id: ADR-008
title: "init completes the tools' files without replacing them, and uninstall finds its own entries"
status: accepted
date: 2026-10-07
protected_files:
  - "scripts/lib/init.mjs"
  - "scripts/lib/templates.mjs"
reason: "Plug and play: one command sets up every tool, and it must be safe to run on a project that already has its own configuration."
rejected_alternatives: []
---

# ADR-008 — init completes the tools' files without replacing them, and uninstall finds its own entries

## Context and Problem Statement

Each AI tool keeps its hooks, skills and instructions in its own files: .codex/hooks.json, .cursor/hooks.json, .github/hooks/, .gemini/settings.json, .agents/skills/, AGENTS.md. Projects often already have some of them.

## Decision Outcome

npx projectmind init writes, for the tools it detects or that --tools names, the hook that runs `projectmind guard <tool>`, the skills in the Agent Skills format, the AGENTS.md block, the Gemini CLI commands and, for Claude Code, the catalog and the plugin in .claude/settings.json. Every command is pinned to the version that wrote it. Existing files are completed, keeping their indentation and line endings, and running init again changes nothing. Every entry says "projectmind", which is how uninstall removes them without a manifest. --dry-run shows the plan without writing anything.

### Consequences

After uninstall, a completed file gets its content back, but a value written on one line comes back spread over several. uninstall also removes the folders it leaves empty, even one that existed, empty, before init. Through npx, a guard call takes about 2.7 s on Windows, against about 0.3 s with node directly (measured on 2026-10-07).
