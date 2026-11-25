# Arena (one ticket, several implementers, one judge)

Use arena for a ticket whose implementation admits more than one valid shape, where the shape is expensive to change later.
It replaces the single implementer for that ticket only; every other ticket in the wave runs normally.

## When the orchestrator picks arena

Mark the ticket `Mode: arena` in the wave checkpoint when it does at least one of these:

- Sets a shape that later tickets build on: a new module boundary, a data model or schema, an error-handling model, a public API or contract, a state machine.
- Blocks two or more other tickets.
- Was contested in the spec phase or in DECISIONS.md.

Do not arena a ticket that is a narrow slice through an existing pattern.
The cost is roughly 3x one ticket, and arena only pays when picking the wrong shape would cost more.

## Phase A: frame

1. Write the artifact every runner must produce: the ticket's acceptance criteria, same per-ticket brief as `implementer-brief.md`.
2. Write a rubric of 3-6 gradeable criteria for this ticket, into `.scratch/<feature>/arena/<NN>/rubric.md`.
   Good criteria: each piece of state has one owner; each task has one way to do it; callers need to know the least; matches the repo's existing paved road; easy to extend for the tickets it blocks (name them).
   Runners do not see the rubric.
3. Pick runners: 2 or 3 implementers on different models (Claude Code: `opus` and `fable`, optionally `sonnet`; pi: add a non-Claude model such as `deepseek-*` when configured).
4. Each runner gets its own worktree, as in the normal brief.

## Phase B: fan out

Launch all runners in one message, in the background, each as `subagent_type: implementer` with its runner's `model` passed explicitly.
Each gets the normal per-ticket brief plus the line `This is an arena run.`, which makes the implementer add `alternatives` to its return.

Runners self-verify exactly as a normal implementer does (targeted tests, UI gate, perf gate when required).
A runner that fails or returns `blocked` drops out; proceed with the rest and note the dropout.

## Phase C: judge

Launch one `subagent_type: judge` on a model none of the runners used where possible, passing `model` explicitly (Claude Code: `sonnet` when the runners were `opus` and `fable`).
Give it only pointers: the rubric path, the ticket path, the base ref, and each runner as a neutral label (`A`, `B`, `C`) with its worktree path and commit SHA.
It scores every candidate criterion by criterion and names a base.

## Phase D: pick and graft

The orchestrator reads the judge's scores and each runner's `alternatives`, not the diffs.
Agreement between the judge and the rubric leader confirms the base.
On disagreement, read the two rationales and decide; log it to DECISIONS.md.

Grafting is done by one fresh `implementer`, in the base's worktree, with a brief that names the one or two things to port from each losing candidate and why.
If all candidates converged on one shape, skip the graft and note "consensus".
If they diverged wildly, the ticket was under-specified: set it `needs-human` if the divergence is about behaviour, otherwise rewrite the brief and rerun.

## Phase E: land

The base (grafted or not) merges like any other ticket.
Delete the losing worktrees and their branches.
Record in the ticket file: runners, base, judge verdict, grafts.
