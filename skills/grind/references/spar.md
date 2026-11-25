# Spar (adversarial final review)

Adversaries on different models try to break the integration branch.
A finding survives only when a command proves it.
This runs in the final gate, after the full suite and before spec-coverage.

`code-review` still runs too: it judges the diff against coding standards and the spec, which needs no repro.
Spar covers what a same-model reading misses: behaviour that is wrong at runtime.

## Frame

1. Scope: the integration branch diff from its merge base with the base branch; in a multi-repo project, one such diff per touched repo, all in each brief (`references/multi-repo.md`).
2. Intent: restate in 3-5 lines what the feature must do, from the spec, the tickets and DECISIONS.md.
   Write it to `.scratch/<feature>/spar/intent.md`.

## Fan out

Launch 2 or 3 `subagent_type: adversary` subagents in one message, in the background, each with a different `model` passed explicitly (Claude Code: `opus`, `fable`, optionally `sonnet`; pi: include a non-Claude model when configured).
The agent definition carries the proof rule, the own-worktree rule, and the return shape.
Each brief is pointers only: the scope (diff range), the intent path, and the base ref (the integration branch tip).

## Verify

Launch one fresh `subagent_type: claim-checker` with pointers to every adversary's return (worktree and repro commit), the integration branch tip as the target ref, and the intent path.
It reruns each finding's command on that tip.
Keep a finding when the output shows the failure and the failure breaks the intent.
Drop the rest and count why.
Merge findings that share a root cause.

## Output

Write `.scratch/<feature>/spar/findings.md`:

- Intent (the restatement).
- Verified findings: command, output, how it breaks the intent, which adversaries found it.
- Dropped: per adversary, count and reason.

Every verified finding becomes a fix ticket in the last implementer wave, carrying its repro command as the failing test to turn green.
A finding that is really a business question (the intent itself is wrong) goes to the user.
