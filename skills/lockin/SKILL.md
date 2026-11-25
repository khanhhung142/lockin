---
name: lockin
description: "A sticky work mode: every message for the rest of the session is routed through one workflow (huddle, spec, tickets, grind, playbooks, verify, replay) one gated step at a time. Use for /lockin <task>, or 'lock in'. Turn off with /lockin off."
disable-model-invocation: true
---

# Lockin mode

Lockin mode stays on for the rest of the session until the user types `/lockin off`.
While it is on, route every message through the table below, run the routed skill or playbook step by step, and stop at each gate for the user.
The rules every route follows (questions, reversible vs irreversible, subagents, verify on the real surface, targeted tests, infra, numbers, root causes, candor) are the "Rules for every playbook" section of `~/.claude/skills/playbook/SKILL.md`; read it once when lockin mode turns on.

## Turning it on

Run `node ~/.claude/skills/warmup/scripts/check-project-docs.mjs <project folder>` once.
`FAIL` lines are wrong facts in the docs: fix them first when the fix is technical (a moved path), ask the user when it is business (a branch).
Mention `warn` lines in the first reply and offer the fix they name.

## Every reply

Open with one status line: `lockin · <route> · <step n/m or phase>`.
Keep the todo list (Claude Code TaskCreate/TodoWrite, pi a markdown checklist) in sync with the route's steps.
End with what happens next and whether it waits on the user.

## Route

Pick the first row that matches.

| Signal | Route |
| --- | --- |
| Chat, a quick question, or a one-line answer | Answer directly; no route. Status line says `lockin · direct`. |
| The project folder has no `AGENTS.md` or no `.agents/skills/verify-*` yet | `/warmup` first, then the route below. |
| Resuming earlier work, or `.scratch/<feature>/` already has tickets | `playbooks/session-pickup.md` of the `playbook` skill, then the route it finds (usually `/grind`). |
| A new idea or feature whose behaviour is not pinned down | **Shape** phase below. |
| Spec exists but no tickets | `/to-tickets`, then gate 3. |
| Tickets exist under `.scratch/<feature>/issues/` | `/grind <feature>`. |
| A single-owner task (bug, refactor, perf, small feature, investigation, forensics, prototype, visual parity, eval, skill authoring) | `/playbook <task>`. |
| "Why is X like this" | `/lore`. |
| "What could this break", or a diff the user distrusts | `/splash`, and `/spar` for anything contested. |
| Prove a change works in the real app | The project's `verify-<app>` skill; none exists, `/scout`. |
| The user corrects you, a run ended, or the same mistake happened twice | `/replay` (automatic run, applies with backups; see the replay skill). |

## Shape phase (gated)

1. **Shape the core behaviour** with the `huddle` skill: "when X happens, what exactly does the system do, and who calls whom?"
   **Gate 1**: read the core behaviour back to the user in plain terms and wait for their confirmation of the behaviour, not just the name.
2. **Size it.**
   One owner can build it: hand off to `/playbook` with the `feature` playbook.
   More than one ticket: continue.
3. **Spec** with `/to-spec`, applying `~/.claude/skills/grind/references/spec-phase.md` (one authoritative spec, business questions settled now, UI principles and screen list captured).
   **Gate 2**: The user reviews the spec path; open business questions are listed, not defaulted.
4. **Tickets** with `/to-tickets` into `.scratch/<feature>/issues/`.
   In a multi-repo project every ticket gets one `**Repo:**` line and `grind.sh check .scratch/<feature>` must pass (`~/.claude/skills/grind/references/multi-repo.md`).
   **Gate 3**: show the ticket graph (`~/.claude/skills/grind/grind.sh status .scratch/<feature>`) and wait for the user's go to start the run.
5. **Build** with `/grind <feature>`.
   It runs unattended; business questions block only their own ticket.
6. **Ship** through `playbooks/opening-an-mr.md` once the whole feature is done.
   **Gate 4**: The user's go to push and open the MR (never into `main`/`master`).

## Turning it off

`/lockin off` ends the mode: drop the status line and stop routing.
Work in flight keeps its on-disk state (`.scratch/<feature>/`, ticket `Status:` lines), so `/lockin` later resumes through session-pickup.
