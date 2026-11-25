# Perf issue

**You own the measurement story. Plan, review, verify the numbers.**
Tie every fix to a measurement; never read source instead of measuring.

1. Fill the four boxes of `~/.claude/skills/grind/references/perf-gate.md` before changing code: metric, probe, baseline, fail line.
   Measure the baseline on the base branch now and keep its raw output.
   Run the probe enough times to see the noise and report the median.
2. Explain the baseline before trusting it.
   Name what limits it (CPU, a query, a lock, the network, GC, payload size) and rule out that the probe measures something else (cold cache, wrong data size, an error path, the harness itself).
   Capture a profile: Go `pprof` or `go tool trace`, MySQL `EXPLAIN ANALYZE` or the slow log, ES `_profile`, a browser Performance trace.
3. Ground hypotheses in the profile and try the mantras in order, cheapest first:
   1. Don't do it: stop work whose result nothing uses.
   2. Do it, but don't do it again.
   3. Do it less.
   4. Do it later.
   5. Do it when they're not looking.
   6. Do it concurrently.
   7. Do it cheaper.

   When an earlier mantra meets the target, stop.
4. Fix one hypothesis at a time and rerun the probe after each.
   Revert any change that does not move the number past noise.
   Delegate implementation to an `implementer` subagent (`opus`, `Perf: required`) with the probe command and the fail line, then review the diff.
5. Compare baseline and treatment side by side (`benchstat` for Go benchmarks).
   Inconclusive or wrong-surface is not a pass.
   Missing a stated budget is a business question for the user.
6. Put the probe, baseline, and treatment in the MR Verification section.
   Run `opening-an-mr`.

For sustained improvement against a target, use `hillclimb`.

**Reply:** baseline, post-fix number, delta, probe command, artifact paths.
