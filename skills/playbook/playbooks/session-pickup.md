# Session pickup

**You own the resume point. Read the prior trail; don't redo it.**

1. Read the on-disk checkpoint first, since it is authoritative.
   Under `.scratch/<feature>/`: ticket `Status:` lines (`~/.claude/skills/grind/grind.sh status .scratch/<feature>`), `DECISIONS.md`, `WAVES.md`, `RESUME.md`, `trail.md`, `MR.md`.
   If the work is a grind run, the resume is simply `/grind`; stop here and run it.
2. Read the prior conversation when the checkpoint leaves gaps.
   In pi, use the `session_search` tool.
   In Claude Code, read `~/.claude/projects/<cwd-slug>/*.jsonl` (slug is the working directory with `/` replaced by `-`), newest by mtime, and stay inside this workspace's slug.
   Read the last messages first, then scan back for decision points.
   Parse a long transcript in a `sonnet` subagent and keep only the reduced timeline here.
3. Reconstruct operational state: branch and worktree, what already landed (`git log`, `git diff` against the base), open todos, decisions made.
4. Diff done against planned and name the resume point.
   Do not rerun the prior repro or redo completed work; a "verify from scratch" pass treats an authoritative trail as untrustworthy.
5. Route the remaining work to its playbook (log it) and pick the verdict: continue, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run with the `replay` skill.
   That playbook owns the rest.
6. Before declaring done, verify the inherited claims against the original goal on the real artifact; a prior self-report is not proof.

**Reply:** where the prior agent stopped, what you inherited versus redid (ideally nothing redone), the resume point, and the outcome.
