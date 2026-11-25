---
name: playbook
description: Routes a task to a step-by-step playbook (bug fix, feature, refactor, perf, hillclimb, investigation, forensics, prototype, visual parity, eval, MR, babysit, shipping, autonomous run, session pickup, pause, plan, worktree cleanup). Use for "/playbook <task>", or when a task clearly matches one of those types.
---

# Playbook

Route the task to one playbook, log the use, then run its steps as a checklist.
Ported from Lauren Tan's pstack playbooks (MIT, copyright 2026 Lauren Tan, see `LICENSE-pstack`).

## Steps

1. Classify the task to exactly one playbook from the table below.
   Torn between two, pick the one whose "You own" line names the deliverable.
   Nothing fits, pick `figure-it-out`.
2. Log the use before any other work: `AGENT=<claude-code|pi|cursor> ~/.claude/skills/playbook/playbook.sh use <name>`.
   This is mandatory, because the log decides which playbooks get pruned.
   Log again whenever a playbook hands off to another one (for example `opening-an-mr`, or `session-pickup` routing to `bug-fix`).
3. Read `playbooks/<name>.md` next to this file and copy its numbered steps verbatim into the todo tool.
   Claude Code uses TaskCreate or TodoWrite.
   Agents without a todo tool (pi) keep a markdown checklist in the reply and tick it as they go.
4. Open the first reply with the playbook name and its "You own" line, then run the steps in order.
5. Finish with the playbook's **Reply** shape.

## Playbooks

| Name | When |
| --- | --- |
| `investigation` | A read-only question about how or why code works; the output is an explanation or a recommendation. |
| `bug-fix` | Something is broken, throwing, or wrong for a user. |
| `perf-issue` | One slow or heavy thing to make faster, measured. |
| `hillclimb` | Sustained, iterative improvement of one metric against a target. |
| `runtime-forensics` | Diagnose a live process (spinning CPU, leak, stuck goroutines, glitch) by instrumenting it. |
| `trace-forensics` | Diagnose from an existing capture (pprof, heap dump, browser trace, slow log). |
| `feature` | Add behaviour that one owner can build; multi-ticket features go to `/to-spec` + `/to-tickets` + `/grind`. |
| `refactoring` | Change structure, keep behaviour. |
| `prototype` | A design or behaviour decision a throwaway build can settle. |
| `visual-parity` | Migrate UI with pixel-exact equivalence proven by image diff. |
| `authoring-a-skill` | Create or modify an agent skill. |
| `eval` | Blind comparison of a prompt, skill, or model variant. |
| `opening-an-mr` | Package one finished feature as an MR into the integration branch (never `main`/`master`); the last step of every code playbook, and a no-op until the feature is done. |
| `babysit` | Watch an open MR: conflicts, review threads, CI. |
| `shipping` | Land a verified stack of MRs bottom-up. |
| `autonomous-run` | Drive to a checkable exit condition without stopping. |
| `autopilot-full` | Several MRs, one owner each, verified by agents that did not write them, through to merge. |
| `autopilot-stack` | Same as `autopilot-full`, but stop at verified and do not merge. |
| `session-pickup` | Resume work a prior session or agent started. |
| `pause-safely` | The user explicitly asks to stop; leave a resumable checkpoint. |
| `multi-phase-plan` | Plan a change that spans several MRs; the plan is the deliverable. |
| `worktree-cleanup` | Reclaim disk from worktrees, Docker leftovers, and caches. |
| `figure-it-out` | Large, cross-cutting, or unattended work that no playbook fits. |

## Rules for every playbook

- **Prototype before asking.** A fork that running something can settle gets settled by running it (`playbooks/prototype.md`).
- **Questions.** Business questions (what users see, do or pay, scope, UX, data meaning, permissions, accepting a perf budget miss) go to the user and are never defaulted.
  Technical questions get decided, logged as one line `question - decision - why` in `.scratch/<feature>/DECISIONS.md`, and work continues.
  While a business question waits, keep working on everything it does not block.
  Ask in the plain format of the `tactics` skill: a numbered question per line, the recommendation on the next line after `->`, and "ok" accepts them all.
- **Reversible work proceeds** without asking: local commits, worktrees, scratch files, targeted tests, local stacks, reading anything.
  **Irreversible work waits for the user's explicit go**: push, opening or merging an MR, force-push, deploy, data deletion, and messaging people (chat, tickets, email, MR comments).
  "Keep going" or "going to bed" keeps reversible work moving; it never grants an irreversible action.
- **Multi-ticket features** go through `/to-spec`, `/to-tickets`, then `/grind`.
  Playbooks cover single-owner work and the design steps before a spec.
- **Subagents** (Claude Code Agent tool; pi only when a subagent extension is installed, otherwise work inline) run in the background, get file pointers instead of pasted context, and get an explicit model: `opus` for code and judgement, `sonnet` for mechanical edits, parsing, and polling, `fable` only as a panel seat (arena, interrogate) or when the user names it.
  Each brief opens with the goal.
  Recurring roles have named agents (`~/.claude/agents/`, from the lockin pack) that carry their stable rules and return shape, so spawn them by `subagent_type` and pass only pointers: `implementer` (code in its own worktree), `source-reader` (cited read-only explanation), `judge` (rubric scoring), `adversary` and `claim-checker` (interrogate), `spec-auditor` (spec coverage).
  You own their work: review the diff or artifact and write your own summary, since a subagent's report is a claim, not evidence.
  Give a fix round to a fresh subagent with the original brief and the prior report.
- **Verify on the real surface**: the project's verify skill, the `run` skill, Playwright against the local stack, or curl/grpcurl against the running service.
  The verdict is VERIFIED, NOT VERIFIED, or INCONCLUSIVE, and inconclusive or wrong-surface is not a pass.
- **Targeted tests only.** The `test-guard` hook blocks whole-suite runs; `FULL=1` is for the one final gate.
- **Long commands run detached.** Anything that can pass 10 minutes (a full suite, a benchmark, a stack launch on a loaded host) starts as `nohup <cmd> > <log> 2>&1 &` and you poll the log in short calls; a tool timeout kills a blocking call mid-run and leaves half-cleaned state (a killed harness run left 2.6 GB that filled the next run's database).
- **Infra** comes from `~/shared-infra` with the project's own database or prefix; any container you start follows the naming and label rules in `~/.claude/CLAUDE.md`, and code-tier ones are removed when the run ends.
- **Numbers** need a probe command, a baseline measured first, and an explanation of what limits them (`~/.claude/skills/grind/references/perf-gate.md`).
- **Root causes.** Fix at the first place the system went wrong; a guard is a fix only when the state it handles is legitimate.
- **Candor.** When asked whether to do something, give the real judgment, including "no, this does not earn its place".

## Skills the playbooks route to

`grind`, `to-spec`, `to-tickets`, `tdd`, `diagnosing-bugs`, `code-review`, `simplify`, `research`, `tactics`, `replay`, `spar`, `lore`, `splash`, `writing-for-agents`.
Arena is `~/.claude/skills/grind/references/arena.md`, usable for one shape-setting change outside a grind run.

## Usage data

`playbook.sh report` prints every playbook with its use count and last-used date, zero-use ones included.
`playbook.sh list` prints the names.
