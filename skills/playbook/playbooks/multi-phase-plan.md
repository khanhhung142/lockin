# Multi-phase plan

**You own the plan, not the code.**
The plan is a checklist an owner runs box by box and the user audits from the evidence.
The plan is the deliverable; do not implement.

1. When the change is one or two files with an obvious approach, skip the plan, say so, and stop.
2. Settle open technical questions by prototype (`prototype.md`) before writing.
   Ask the user only the business questions no run can settle, through the `huddle` skill when there are several.
3. Write the spec with `/to-spec`, then the tickets with `/to-tickets`, so `/grind` can execute them.
   Open the spec with what changes, the MRs in landing order, and the dependency graph: which branch from the integration branch, which wait for which, and the files each may touch.
4. Make each ticket one MR with its own evidence, with checkboxes for: what it depends on, the files it edits, the one change it builds, the result you see, and its verification.
5. Tests alone are not verification.
   Each ticket has a unit box, a live box (the real surface, a concrete scenario, and a pass predicate), and a perf box when it can move a number (metric, probe, baseline measured first on the integration branch, fail line, per `~/.claude/skills/grind/references/perf-gate.md`).
   Mark tickets that change an interaction as review-gated by the user before merge.
6. Hand back the spec and ticket paths and stop.
   Execution starts with `/grind` on the user's explicit go.

**Reply:** the spec path, the tickets with their dependencies, the review-gated set, and what stays unproven.
