# Worktree cleanup

**You own the disk you free and every byte of work you keep.**
This is the one playbook that deletes user state with no code review to catch a slip, so the gates below are the review.

1. Snapshot and audit.
   Record `df -h /` and `docker system df`, then run `~/.claude/skills/playbook/scripts/worktree-audit.sh [-b <base-ref>] [repo-path]` per repo, in the background since the transcript scan is slow.
   Pass `-b origin/<branch>` when MRs target a branch other than `origin/HEAD` (for example `origin/stable`).
   The script reads paths from `git worktree list`, never hand-typed paths, and classifies each worktree by size, age, merge state, uncommitted work, remote branch, and the newest agent session that touched it.
2. Treat the bucket as advice, not permission.
   Ask the user which sessions are still active and cross-check every candidate against that set; the active set wins.
3. Verify usage before deleting.
   For every `verify-recent-chat` row, or any you doubt, have `sonnet` subagents read the matching transcripts and report whether that session is ongoing and which worktrees it touches.
   An active session's background subagents use sibling worktrees whose names never appear in its main thread.
4. Pause on irreversible loss.
   `wip:N` means N tracked uncommitted edits: show the diff and get the user's decision, since that work is gone once removed.
   `scratch:N` is untracked files: name them, then they may go.
   Clean, merged, and not-in-use worktrees proceed.
5. Prune the confirmed set: `git worktree remove --force <path>` per path, `rm -rf` the dir if ignored build artifacts keep it alive, then `git worktree prune`.
   Branch refs survive, so no commits are lost.
6. Reclaim Docker per `~/.claude/CLAUDE.md`.
   Remove code-tier containers, images, and build cache (`docker ps -a --filter label=tier=code`, `docker builder prune`), and list dangling or unlabeled volumes for the user.
   Never delete an infra-tier volume or image, or anything under `~/shared-infra`, unless the user asks.
7. Clear other caches only when the user has not said to keep them: `go clean -cache`, pnpm, yarn, npm, brew, and `node_modules` in pruned trees.
8. Confirm with `df -h /`, `docker system df`, and a fresh `git worktree list`.

**Reply:** `df -h /` before and after with space reclaimed, the worktrees pruned, Docker resources removed, and a one-line reason for each one held back.
