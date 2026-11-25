---
name: grind
description: "Resumable orchestrator for a spec's tickets. Runs the frontier one wave at a time with slim context, checkpoints to disk after every ticket so you can stop and continue on another machine, self-verifies once per ticket (no parent re-runs), gates UI on design quality, and reconciles the whole spec at the end. Use after /to-spec + /to-tickets to build a feature; invoke again anytime to resume or check progress."
disable-model-invocation: true
---

# Grind

Build a spec's tickets to completion as a **resumable, slim-context** run. Replaces the single giant parent-agent orchestration that bloats context and can't survive a stop.

Composes the Matt Pocock skills (`to-spec`, `to-tickets`, `tdd`, `code-review`) without modifying them. It expects tickets already published as local files under `.scratch/<feature>/issues/NN-*.md` (what `/to-tickets` produces). If none exist, tell the user to run `/to-tickets` first.

## Core ideas

- **Checkpoint**: the ground truth of progress is on disk, never in this context. Each ticket file carries a `Status:` line; each finished ticket is its own commit. A fresh agent on any machine reconstructs the full state by reading ticket statuses + git log. This is what makes the run survivable: lose the network, close the laptop, come back tomorrow, re-invoke `/grind`.
- **Frontier**: the set of tickets whose blockers are all `done`. Grind works one **wave** (the current frontier) at a time, not the whole graph at once.
- **Verify-once**: the implementer subagent runs its own typecheck + **targeted** tests (only those covering the files it changed) and reports pass/fail with evidence. The orchestrator **trusts that** - it does NOT re-run tests per ticket. The full suite runs exactly once, at the end. This is enforced, not requested: the global `test-guard` hook (`~/.agents/hooks/test_guard.py`, wired into Claude Code, Cursor and pi) blocks `go test ./...`, `make test|e2e` and bare Playwright/e2e runs unless prefixed `FULL=1`. Only the final gate uses `FULL=1`.
- **Questions**: business questions go to the human; technical questions do not. See "Questions" below.
- **Gate**: a ticket is not `done` until it passes its gate. UI tickets gate on design quality, not just field presence.
- **Slim context**: the orchestrator holds pointers (spec path, ticket numbers, commit SHAs), never subagent transcripts. Subagents return a one-screen structured result, nothing more.

## Modes

Invoked with no argument, Grind is **idempotent**: it reads current state and does the right thing (start fresh, resume, or report all-done). Explicit modes:

- `/grind` or `/grind <feature>` - start or resume the run.
- `/grind status` - progress report only, dispatch nothing.

## Helper script

The mechanical state ops run as bash, not LLM work - call `grind.sh` (next to this file) instead of reasoning about progress:

- `grind.sh status <feature-dir>` - progress table + `done N/M` + the current frontier.
- `grind.sh frontier <feature-dir>` - ready ticket numbers (blockers all `done`), one per line - this IS the next wave.
- `grind.sh set <ticket-file> done` - stamp a ticket's `Status:` line after it merges; it refuses while a `- [ ]` acceptance box is open.
- `grind.sh repos <feature-dir>` - repos the tickets touch; `grind.sh check <feature-dir>` - fails unless every ticket names exactly one existing repo (multi-repo projects).

It parses the `/to-tickets` local format (`**Status:**` + `**Blocked by:**` lines). Use it for every state read/write; reserve the model for implementing and judging.

## Steps

### 1. Locate the run

Find the feature dir under `.scratch/`. If the user named one, use it; else if exactly one has `issues/`, use it; else list candidates and ask. Read the spec and every ticket file. Build the ticket graph from the `Blocked by` lines.

**Multi-repo projects** (the project folder holding `.scratch/` is not itself a git repo): run `grind.sh check <feature-dir>` and fix every ticket it flags before any wave, then follow `references/multi-repo.md` for branches, worktrees, gates and MRs.

### 2. Report state, then (unless `status`) confirm the plan

Print the **progress table**: each ticket, its `Status:`, its blockers. Summarize: N done, M ready (frontier), K blocked. For `status` mode, stop here.

Otherwise state the next wave (the current frontier) and how many implementers you'll launch in parallel, then proceed.

### 3. Run the frontier, one wave at a time

**Wave checkpoint first.** Before launching a wave, append a section `## Wave <n>` to `.scratch/<feature>/WAVES.md` with these four items, always all four. An item that genuinely does not apply keeps its line as `n/a: <reason>`; it is never dropped.

1. **Blocking first steps**: what must land before fan-out (a migration, a shared type, a generated client, a contract change in the repo that owns it). Run it as its own one-ticket wave first.
2. **Independent workstreams**: which frontier tickets touch disjoint files, services, or layers. Read each ticket's named files; those run in parallel. Tickets that write the same file serialize into the next wave.
3. **Shared mutable state**: files every ticket wants to append to (route registry, mock db, migration numbering, i18n bundle, OpenAPI spec). Default to splitting the target (one file per ticket, or the blocking step creates the slots) instead of serializing. Serialize only for a real invariant. Also the runtime: name the services and repos no ticket in the wave changes; implementers share one instance of each at its current commit instead of each building its own (implementer `Infra`), and a one-of-a-kind resource (an emulator, a device) is held per command, not per ticket.
4. **Smallest safe decomposition**: per ticket, `Mode: single` or `Mode: arena` (see `references/arena.md`), and `Perf: required` or `Perf: n/a - <reason>` (see `references/perf-gate.md`). If the whole wave is better as one implementer, say why.

The checkpoint is on disk, so a resumed run reuses it instead of re-deciding.

For each ticket in the current frontier, launch an **implementer subagent** (`subagent_type: implementer`, parallel across the wave), or an arena for `Mode: arena` tickets. The agent definition holds the stable rules; `references/implementer-brief.md` is the per-ticket brief, pointers only. In short, each implementer:

- works in its **own git worktree** off the integration branch of its ticket's repo (real isolation - parallel implementers must not share a tree, or they stomp each other's files);
- builds the ticket via the `tdd` skill;
- passes its **gate** (UI tickets: `references/ui-gate.md`; `Perf: required` tickets: `references/perf-gate.md`, baseline measured before the change);
- self-verifies (typecheck + its own tests green) and **commits**;
- returns a structured result: ticket number, done/blocked, commit SHA, one-line what-shipped, and any `build-question` it hit.

When an implementer returns, merge its worktree commit into the integration branch (of that ticket's repo), set its ticket `Status: done`, and record the SHA in the ticket file. A merge conflict or a `blocked`/failed result flips the ticket to `Status: needs-human` with the reason - do not silently default past it.

**Checkpoint discipline**: update the ticket file (and commit it when `.scratch/` is inside a git repo) *immediately* when each ticket finishes, before launching the next wave. The run must be safe to kill at any instant.

**Shared runtime cleanup**: once every ticket of the wave has merged, remove the shared code-tier containers and images (`docker ps -a --filter label=project=<project> --filter label=shared=true`) whose commit the next wave no longer needs; keep the ones still at a current tip.

**Wave review**: once every ticket of the wave has merged, run `references/wave-review.md` before the next wave starts. It is hidden from implementers; follow its secrecy rules exactly. Its `bug` findings are fixed inside the wave (one fix round at most), its `polish` findings collect in `POLISH.md` for one pass at the end; no finding becomes a new ticket.

### Questions (business asks, technical decides)

A past run sat idle 16 hours overnight because the agent stopped to ask a question while the human was away. Another lost hours to technical choices nobody needed to weigh in on. Split every open question into one of two kinds:

- **Business**: anything that changes what a user or customer sees, does, or pays, or what the domain means. Scope, product behaviour, UX/IA choices, pricing and money rules, data meaning, permissions and security policy, accepting a perf/SLA budget miss, dropping or deferring a requirement. **Always ask the human. Never default a business question.**
- **Technical**: how to build it. Library, structure, naming, query shape, test strategy, refactor, a perf fix that keeps the budget. **Decide it yourself**, append one line to `.scratch/<feature>/DECISIONS.md` (`ticket - question - decision - why`), and keep going. The human reads DECISIONS.md at the end and can reverse anything there.

When a business question comes up, it blocks **only its own ticket**: set that ticket `Status: needs-human` with the question in the file, ask the human right away, and keep every other ready ticket running. Batch questions that arrive in the same wave into one ask. Never end a turn idle while unblocked tickets remain, and never park a business question until the end of the run.

Ask without waiting: launch the next wave first, then ask, or ask in the message that reports the wave. A blocking question tool (pi `questionnaire`, which returns "no answer" after `timeoutMinutes`, default 10) is only for a question that blocks every ready ticket; on a timeout, keep going and ask again when the turn ends. A run lost 4.6 h overnight waiting on one such question while four tickets were ready.

### Scope (findings outside the spec)

Implementers, reviewers and verify passes find defects the spec never asked for. Only two kinds run in this grind run:

- the unfinished part of an in-scope ticket that had to be split (a contract field first, then the server, then the console);
- a fix the final gates require (a review or spar finding on code this run wrote, a broken test);
- a wave review finding, handled by `references/wave-review.md` (fix round or `POLISH.md`, never a new ticket).

Every other finding becomes a ticket with `Status: needs-triage` and a `Found by:` line, and waits. At the end of the run, list them in one ask with a one-line "what and why" each, so the human picks what to build. A run that filed and built every finding grew from 14 tickets to 58 and from about 5 hours to 21 before anyone chose that.

### 4. Recompute the frontier and repeat

New tickets become ready as blockers reach `done`. Launch the next wave. Continue until no ready tickets remain. If tickets are left `needs-human`, stop and report them - the way forward needs a decision.

### 5. Final gates (once, at the end)

Only when every ticket is `done`:

1. Run the **full** test/e2e suite once on the integration branch (once per touched repo), prefixed `FULL=1` (the `test-guard` hook blocks it otherwise). Run the system-wide perf benchmarks / p95 checks here too (per-ticket probes already ran in the perf gate); a budget miss is a business question for the human, not a reason to loop.
2. Call the `code-review` skill on the integration branch (standards + spec, judgement only). In parallel, run **spar** per `references/spar.md`: adversaries on different models try to break the branch, and only findings a rerun command proves survive.
3. Run the **spec-coverage reconciliation** in `references/spec-coverage.md`: an independent `spec-auditor` subagent re-reads the whole spec (and the source PRD/mocks if referenced) and maps every requirement to a done ticket or shipped code, listing anything with no home. This is the gate that catches requirements dropped between spec and tickets - the per-ticket checks never see them.
4. Fix any gap, review finding or verified interrogate finding in one more implementer wave (each spar finding's repro command is that ticket's failing test), together with one ticket for everything in `POLISH.md` (its `## Cleanup` section included: unused assets, leftover Docker images, worktrees, merged branches, scratch files), then report the integration branch. Review that wave once; report what is left instead of filing more.
5. **Docs sync** (`~/.claude/skills/warmup/SKILL.md`, "Keeping it true"): run `/rescout` limited to the features the run touched (new surface: new feature file), add new domain terms to `GLOSSARY.md` and any hard-to-reverse decision as an ADR, update the project `AGENTS.md` for new repos, branches, contracts or data, then `node ~/.claude/skills/warmup/scripts/check-project-docs.mjs <project>` must print no `FAIL`.
6. Run `/replay grind <feature>` (the `replay` skill, automatic run): it applies its Accepted changes with backups and logs them to `~/.agents/lockin/retro/log.md`; also write its Accepted / Rejected / Backlog to `.scratch/<feature>/RETRO.md`.

## Resume & progress (the stop/continue contract)

There is no separate resume logic: step 1 reads disk, step 2 reports, step 3 picks up the frontier. Because every `done` ticket is committed and status-stamped, a brand-new agent - on a different machine, after a network drop - resumes correctly from `/grind` alone. Nothing lives only in a context window.

Tell the user they can `/grind status` anytime (even mid-run from another terminal) for a progress read, and that killing the run loses at most the one in-flight wave, which re-runs cleanly on next `/grind`.

## Reference

- `references/multi-repo.md` - projects made of several git repos: one repo per ticket, contract first, per-repo integration branches, whole-stack verify, one MR per repo.
- `references/implementer-brief.md` - the per-ticket brief handed to each `implementer` subagent.
- Agents (`~/.claude/agents/`, from the lockin pack): `implementer`, `adversary`, `judge`, `claim-checker`, `spec-auditor`. Spawn them by `subagent_type` and pass only pointers.
- `references/ui-gate.md` - the design-quality gate for UI tickets.
- `references/wave-review.md` - the hidden per-wave QA check (orchestrator only; never point an implementer at it).
- `references/perf-gate.md` - the per-ticket perf gate (metric, probe, baseline first, fail line).
- `references/arena.md` - several implementers on different models for a shape-setting ticket, one judge, graft.
- `references/spar.md` - adversarial final review where only command-proven findings survive.
- `references/spec-coverage.md` - the final whole-spec reconciliation pass.
- `references/spec-phase.md` - how to harden the spec *before* driving, so fewer requirements are missed (shape the core concept's behaviour, collapse conflicting sources to one spec, settle business questions before the run).
