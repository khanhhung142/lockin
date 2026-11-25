# Figure it out

**You own the workflow. When no playbook fits, design one, and leave a trail the user can audit after stepping away.**
For large migrations, ambitious multi-part changes, and unattended work.
If the work splits into more than one ticket, the design below ends in `/to-spec` + `/to-tickets` + `/grind`.

1. Frame.
   Ground first, then commit to:

   - the definition of done as a falsifiable predicate;
   - the scope, quantified in rough units and effort, plus blockers the grounding surfaced;
   - the rigor level, biased high: one-way doors and wide blast radius get more gates and artifacts, reversible low-stakes steps get fewer.

   Present the framing and tradeoffs before a long run; a multi-hour run earns one checkpoint with the user.
2. Design the workflow.
   Decompose into atomic, independently landable units, riskiest unknown first, scaffold and verification before features.
   Build the verification harness before the work, with a baseline from the pre-change state, so each check reads "old value versus new value".
   For one-way-door design decisions, run arena (`~/.claude/skills/grind/references/arena.md`); skip it for mechanical work whose shape is already concrete.
   Fan out only across real seams, each worker in its own worktree.
   Write the phase list to `.scratch/<feature>/PLAN.md`, because that list is what the user reviews.
3. Add the designed steps to the todo list between this step and step 5, then run each as an experiment: state the hypothesis, make the smallest change, measure against the predicate on the real artifact, keep it if it advanced, revert it if not.

   - Verify by inspecting the artifact, never a self-report; when something passes too easily, suspect the observation first.
   - Pair delegated work with a reviewer; if a worker games the gate, reset and harden the contract, and if the gate is wrong, fix the gate in its own change.
   - A verdict is VERIFIED, NOT VERIFIED, or INCONCLUSIVE; inconclusive is not a pass, and negatives get reported.
4. Keep the trail as you go, one row per landed step in `.scratch/<feature>/trail.md`, with technical decisions in `DECISIONS.md`.
5. Check the whole against the step 1 predicate on the real product, not just the harness.
   Encode any correction you made twice as a test, lint, hook, or script.
6. Run `opening-an-mr` for the result.

**Reply:** the workflow you designed, the rigor level and why, the trail path, what is verified against the predicate, and what is still open.
