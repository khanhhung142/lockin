# Autopilot-full

**You own the verdicts, never the MRs. One owner carries each MR from build to merge-ready, and nothing merges until verifiers that never wrote the code have proven it.**
A multi-ticket feature belongs to `/grind`; autopilot is for a queue of independent MRs the user hands over.

1. The user's gates come first.
   The user's go covers only the named queue: pushing each owner's branch and opening its MR.
   Merging needs its own go, per MR or for a named list; items the user calls their own stop at merge-ready.
   A request to state the plan is not a go.
2. Spawn one `opus` owner subagent per MR, each in its own worktree off the integration branch, in parallel and never stacked.
   Each owner builds, runs `simplify`, proves the change on the real surface, then runs `opening-an-mr` and `babysit` in `drive` mode.
   An owner rebases only its own branch and publishes with `git push --force-with-lease=<branch>:<sha-it-last-pushed>`; a push it did not make stops it and gets reported.
3. Make the work survive a dead agent.
   Each owner pushes each finished unit before the next and keeps a trail in `.scratch/<feature>/<mr>/trail.md`.
   Record every subagent's id, task, and expected runtime in `.scratch/<feature>/agents.md` so a replacement can find its work.
4. Verify once at the code-ready head.
   Launch 2-3 verifier subagents on different models (`opus`, `fable`, optionally `sonnet`) that rerun the targeted gates, prove the load-bearing behaviour live on the real surface, and audit the diff.
   A rebase or minor fix gets one verifier at the new head; a wording-only change gets none.
   Block only for a problem you can show: a failing run at the head, a bug a user would hit, or a doc line the MR made wrong.
   Problems the base already has go to a follow-up.
5. Merge prep: rebase onto the current integration branch, wait for green CI at that head, then ask the user for the merge go with each MR's verdict and head SHA.
   Before merging, fetch the integration branch; if it touched the patch's files, callers, or dependencies, rerun the patch's checks on the merge result first.
6. Hold the root layer.
   Anything that loosens a gate (a raised budget, a skipped test, an allowlist entry) needs a verifier's proof and your countersign, because the owner is the one who wants green.
   A disabled or soft-failed check always comes back out.
7. Audit with the `loop` skill every hour until no delegated work is left: judge each agent by its side effects (pushes, trail rows), not its status text, and replace a stuck one at once.
8. On the user's stop, every owner stops writing, reports where it stands, and waits.

**Reply:** each MR's state and verdict, what merged, countersigns and why, gates waiting on the user, and parked follow-ups, with MR links and trail paths.
