---
id: ADR-006
title: "Distribution: the Claude Code plugin first, then the projectmind npm package"
status: accepted
date: 2026-10-05
protected_files:
  - ".claude-plugin"
reason: "Publish early in the Anthropic directory; npm then provides an npx command that every tool can run, and Node is already required."
rejected_alternatives:
  - "The official claude-plugins-official marketplace: it is reserved for Anthropic partners."
  - "Finish everything before publishing: the release would come later."
---

# ADR-006 — Distribution: the Claude Code plugin first, then the projectmind npm package

## Context and Problem Statement

Anthropic's official marketplace takes no public submissions; the Anthropic directory (claude.ai/directory/manage) is open and requires a license. The projectmind name is free on npm as of 2026-10-05. Installing from the public Diags/projetMind repository was tested on 2026-10-05.

## Decision Outcome

Phase 1: the Claude Code plugin, in English, under the MIT license, with Diaguily SYLLA as author, is submitted to the Anthropic directory; our repository also stays its own catalog. Phase 2: a projectmind npm package, with no dependency, provides npx projectmind init and the commands for the other tools.

### Consequences

Each new version bumps the version field of plugin.json and package.json. Public actions (push, npm publish, directory submission) are done by the maintainer.
