# Autonomous run

**You own the exit condition. Define done, then drive to it without stopping.**

1. State the exit condition as a checkable predicate before the first iteration (targeted tests green, repro fixed, pixel diff zero, metric past target).
2. Pick the wake mechanism.
   An event to wait on (CI, a long build, a ref advancing) gets a background command or watcher that wakes you, with a long heartbeat as fallback.
   No event gets a fixed-interval heartbeat via the `loop` skill (Claude Code) or the loop extension (pi), sized to when the result is worth re-checking.
3. Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits it if it advanced, and discards it if it did not.
4. Mid-run discoveries that serve the goal are yours: broken tooling, flaky tests, lint, related bugs.
   Fix them in their own commits, then return to the predicate.
   Do not park reversible work for the user.
   Surface only irreversible actions, business questions no experiment can settle, or a real dead end, and keep working on what they do not block.
5. Checkpoint every iteration as one row in `.scratch/<feature>/trail.md`: what changed and whether the predicate moved.
6. Stop when the predicate is met.
   A plateau is not a stop, so pivot the approach.
   Surface a real dead end instead of spinning, and never relax the predicate to declare victory.

**Reply:** the exit condition, iterations run, what landed, what was discarded, the final predicate state.
