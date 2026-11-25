---
name: lore
description: "Use for 'why does X work this way', 'why did we pick Y', design rationale, regressions, postmortems, or data-backed thresholds. Returns a cited read on decisions and tradeoffs from the record (commits, MRs, ADRs, decision logs), not from reading the code. For what the code does at runtime, read the code or use Explore instead."
disable-model-invocation: true
---

# Lore

Answer from the record, not the code.
Read the commits that introduced the target and each later change to it, then the other records if the trail is thin.
Cite what the authors wrote, mark your own inferences as inferences, and say what the record does not answer.

## Where the record lives

Search in this order and stop when the answer is cited:

1. Git history of the target: `git log --follow -p -- <file>`, `git log -S '<symbol>' --oneline`, `git blame -w -C <file>` on the lines in question, and the full message of each commit found.
2. MR discussions: when the forge has no CLI here, take the MR id from merge commits (`git log --merges --grep '<symbol or branch>'`) and say the discussion was not read when you cannot open it.
3. Decision logs: `.scratch/<feature>/DECISIONS.md`, `.scratch/<feature>/` specs and tickets, ADRs (`docs/adr/`), the glossary or context file, project wikis, and the repo's own `docs/`.
4. Product docs: PRDs and technical docs through whatever docs tool the workspace has (an MCP server, a wiki export) when the question is about behaviour users see.
5. Past agent sessions: the `session_search` tool in pi, or grep `~/.claude/projects/<path>/*.jsonl`, when the decision was made with an agent.

## Reply

- **Answer**: the reason, in two or three sentences.
- **Evidence**: each claim with its source (commit SHA and subject, file and line of a doc, MR id), quoted where short.
- **Inferences**: what you concluded without a written source, marked as such.
- **Not in the record**: what remains unanswered, and who or what could answer it.

Adapted from `lore` in Lauren Tan's pstack (MIT, see `../splash/LICENSE-pstack`).
