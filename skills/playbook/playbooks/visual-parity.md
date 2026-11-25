# Visual parity

**You own pixel-exact equivalence. The baseline is the spec, and you do not touch it.**
Equivalence is proven by image diff, not by eye.

1. Build the baseline before any migration: a Playwright harness (`toHaveScreenshot` or an equivalent pixel diff) that captures the current component across its states, viewports, and themes, plus the target when matching two implementations.
   No baseline, no parity claim.
2. Hold the anti-shortcut rules: no harness changes, no baseline edits, no restructuring a component to make a diff pass.
   If the baseline looks wrong, stop and ask the user.
3. Migrate shared primitives first as a blocking phase, then one component at a time, parallel across worktrees with one owner per component.
4. Diff each component against its baseline; any nonzero diff fails.
   Investigate the pixel delta and loop until the diff is zero.
5. Commit per component or per safe batch; run `opening-an-mr` once the whole migration is at zero diff.

**Reply:** components migrated, the diff result for each, the harness location, what is left.
