# Pause safely

**You own a clean stop. Leave a checkpoint a cold-start agent on any machine can resume from.**
This runs only when the user asks for it; "keep going", "going to bed, keep going", or "don't stop" mean do not pause.

1. Stop at a safe boundary: finish the current atomic step or back out of it, start nothing new, and stop any background subagents.
2. Take no irreversible action to pause: no push and no MR unless one was already out.
3. Make the work durable.
   Commit uncommitted edits as one `wip:` commit on the current branch; if the tree is broken, say so in one line of the commit body.
   For a grind run, set each in-flight ticket's `Status:` line to match reality so `/grind` resumes it cleanly.
4. Write `.scratch/<feature>/RESUME.md`: intent, what you were doing, progress and what is verified, current state (branch, worktree, running containers), next steps, key files, gotchas.
   Point at existing `DECISIONS.md` or `trail.md` instead of duplicating them.
5. Leave no code-tier containers running; shared-infra stays up.

**Reply:** where you are in the loop, what is on disk versus only in your head (paths, no diff dumps), the commits made and whether the tree is clean, and the first action on resume.
This is a pause, not a final report.
