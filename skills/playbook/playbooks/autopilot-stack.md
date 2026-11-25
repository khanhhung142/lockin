# Autopilot-stack

**You own the verdicts. Run `autopilot-full`, but stop at verified and merge nothing.**

1. In place of autopilot-full step 5, stop when each MR is verified and green at its current head, then hand the MRs to the user.
   After the handoff, nobody pushes without the user's go.
   Every loop tick prompt names this file so each tick sees the no-merge rule.
2. Stack an MR only when it builds on another MR; this is the one exception to autopilot-full step 2.
   Target the parent MR's branch instead of the integration branch, per `opening-an-mr.md`; each stacked MR still carries one finished feature.
   Each MR rebases onto its parent's branch and the stack root onto the integration branch, never `main`/`master`.
   A new head on a lower MR restacks the ones above it, and an MR whose `git patch-id` the restack leaves unchanged keeps its verdict.

**Reply:** each MR with its verdict, base, and head SHA, in place of what merged.
