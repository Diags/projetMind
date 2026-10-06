---
name: remember
description: Records a project decision in docs/decisions/ as a numbered ADR, with the files it protects, the reason and the rejected alternatives.
argument-hint: "[decision to record]"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/adr.mjs" list *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/adr.mjs" create --dry-run *)
---

# Record a decision

Decision to record: $ARGUMENTS

You propose, the user approves. Nothing is written without an explicit "yes" from them in the chat.
Do not invent a reason, a file or an alternative: whatever the conversation or the repository does not say, ask for it.
Do not choose the ADR number: the script computes it.
Reply in the user's language.

If no decision is given above, ask which one to record and stop there.

## 1. Check what already exists

- Read the ADRs already recorded:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/adr.mjs" list --root "${CLAUDE_PROJECT_DIR}"`
  If one already covers the topic, cite it and ask whether a new ADR is needed.
- If the project already keeps a decision register elsewhere (invariants, lessons learned, debt… cited in
  `CLAUDE.md` or the `README`), say so: the decision may already be there. No duplicate without agreement.

## 2. Prepare the fields

| Field | Content |
|---|---|
| `title` | The decision in one short sentence, on one line. |
| `reason` | Why, in one or two sentences. It will be shown to whoever touches a protected file. |
| `protected_files` | Paths relative to the project root, or glob patterns. `*` stays within a folder, `**` crosses folders, a path without wildcards also covers what it contains: `runtime` protects all of `runtime/`, `*.sql` only targets the root, `**/*.sql` targets the whole project. Check with Glob that they match existing files. Empty list if the decision protects no file. |
| `rejected_alternatives` | Options set aside, each followed by its reason in a few words. Empty list if there are none. |
| `context` | The problem that led to the decision. |
| `options` | The options considered. Optional. |
| `decision` | What is decided, precisely. |
| `consequences` | Positive and negative effects. Optional. |

## 3. Show the preview

The preview writes nothing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/adr.mjs" create --dry-run --root "${CLAUDE_PROJECT_DIR}" <<'JSON'
{ "title": "…", "reason": "…", "protected_files": ["…"], "rejected_alternatives": ["…"], "context": "…", "options": "…", "decision": "…", "consequences": "…" }
JSON
```

Show the output as is, then ask: "Shall I record this ADR?".
If the user corrects a point, redo the preview before asking again.

## 4. Write, only after agreement

Run the same command again, with the same JSON, without `--dry-run`.
Give the path of the created file. Do not commit or push.
