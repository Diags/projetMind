---
name: why
description: Shows what the project knows about a file — ADRs that protect or cite it, mentions in the existing documentation, last commits — with the source of each item.
argument-hint: "<file>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/why.mjs" *)
---

# Why this file?

Requested file: $ARGUMENTS

If no file is given above, ask which one and stop there.
Do not modify any file. Reply in the user's language.

1. Run the search, with the path as the user gave it:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/why.mjs" --root "${CLAUDE_PROJECT_DIR}" "<file>"`
2. Show the output as is.
3. Add a summary of three sentences at most, drawn only from what the output cites.
   Each claim points to its source: `ADR-001`, `DEBT.md:110`, commit `a1b2c3d`.
   You may open a cited source to read the paragraph around the line, nothing else.
4. If the output finds nothing, say so in one sentence. Do not invent a reason and do not infer it from the code.
