# Hillclimb

**You own the metric and the experiment's integrity. Supervise and review; delegate the attempts.**
This is the loop for sustained improvement of one measurable thing; a one-off fix is `bug-fix` or `perf-issue`.

One change, one measurement, keep or revert.
Never stack untested changes, and never claim a win from code inspection.

1. Ground the workload before choosing the metric.
   Trace the target, name the workload dimensions that move the result (data size, history, concurrency, state), and pick a case that reproduces the complaint.
   If no case reproduces it, fix the repro first.
   Then fix one metric, its better direction, and a stop predicate that pairs a target with a floor on attempts (for example "at least 50% better than baseline and at least 10 iterations").
   Use the user's numbers when given; a target is a business call, so ask when none is given.
2. Build the measurement harness, prove its sensitivity, then freeze it.
   Run contrasting workloads and confirm the target case shows the symptom while easier cases separate as expected.
   Make the harness print its error count and a count of the work done.
   Once frozen, one command emits the metric as a median of N runs.
   Record the baseline and a green run of the regression gate (the targeted tests that must keep passing) before any change.
3. Open the decision log `.scratch/<feature>/decision.tsv`, one row per attempt: id, hypothesis, change, before, after, delta, tests, verdict, note.
   Read it before each attempt.
4. Ground each hypothesis in a named mechanism ("move X off the request path because it holds the row lock"), not "try caching something".
   For a perf metric, order hypotheses by the mantras in `perf-issue.md` step 3.
5. Loop, one hypothesis per iteration:

   - Hand the change to an `implementer` subagent (`opus`) with a tight scope and review its diff.
     Independent live hypotheses fan out to parallel implementers, each in its own worktree.
   - Measure before and after with the frozen harness and run the regression gate.
   - Keep the change only when the metric moves past noise and the gate stays green; otherwise revert it in full.
   - Commit each kept fix alone with `git add <files>`, never `-A`.
     Log the row either way.

   If the run is unattended, borrow the wake mechanism from `autonomous-run.md`, not its stop rule.
6. Push past the first plateau.
   After several rejects in a row, pivot category, combine near-misses, re-read the source, or try something more radical.
   Correctness and simplicity outrank the number: revert a win that breaks behaviour, keep a simplification that holds the number.
7. Stop when the predicate is met, or when only marginal ideas remain.
   Never relax the predicate to meet it; surface a real dead end instead of spinning.
8. Run `opening-an-mr` with the kept commits in the order they landed.

**Reply:** metric and target, baseline to final with percent delta, iterations run (kept vs reverted), each kept fix on one line, the `decision.tsv` path, and the next idea you would try.
