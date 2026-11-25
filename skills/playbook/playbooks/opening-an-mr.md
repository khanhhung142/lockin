# Opening an MR

**You own a reviewable MR for one finished feature. Everything up to the push is yours; the push is the user's call.**
Code playbooks end here, but this playbook opens an MR only when the gate in step 1 passes.
When the forge has no CLI (`gh`, `glab`), use its REST API.

1. **Gate: is the whole feature done?**
   An MR carries one finished feature (or one finished bug fix, refactor or perf change that stands on its own), never a ticket, a phase or a work-in-progress slice of one.
   With a grind run, "done" means every ticket is `done` and the final gates passed.
   Otherwise it means every acceptance criterion of the spec or the request is met and verified on the real surface.
   If the feature is not done, stop here: keep the work as local commits on the feature branch, and report what remains.
   Do not open a draft MR as a substitute.
   A feature that spans several repos is one feature: every touched repo gets its MR only when the whole feature is done, and steps 2-8 run once per repo (`~/.claude/skills/grind/references/multi-repo.md`).
2. **Pick the base: never `main` or `master`.**
   Read the repo table in the project `AGENTS.md` first.
   The base is the repo's MR target from that table (for a pattern such as `version/<xx>`, the version the spec names).
   Without a table, it is the branch this feature branched from, when that is not `main`/`master`, or the repo's convention (`dev`, `stage`, `stable` and so on; check `git branch -r` and recent merge commits).
   If the only candidate is `main`/`master`, or two candidates are plausible, ask the user which branch to target.
   The `mr_guard` hook (`~/.agents/hooks/mr_guard.py`, wired into Claude Code, pi and Cursor) blocks any push to `main`/`master` and any `merge_request.target=main|master`.
3. Work in a git worktree off the base branch, holding only this feature.
4. Rebase into small, ordered, landable commits: a failing test before its fix, a subtraction before a reshape.
   Commit messages follow `type(scope): subject`, naming a real symbol when one carries the change, with no agent co-author line.
5. Run the `simplify` skill over the diff, then the targeted tests and lint for the touched paths.
6. Write the MR description to `.scratch/<feature>/MR.md`: a title line `type(scope): subject`, then a one-minute briefing under 40 lines with these `##` headings in order, dropping empty ones: `## Why`, `## What changed`, `## Scope`, `## Tradeoffs` (only rejected alternatives a reviewer would ask about), `## Blast Radius`, `## Verification`.
   Multi-repo: one `MR-<repo>.md` per repo, each with a `## Related MRs` heading that lists the sibling MRs and the merge order (contract providers first).
   Fill Blast Radius from the `splash` skill and Verification with the commands you ran and their output.
7. Ask the user for the go, showing the branch, base, commit list, and the MR.md path (for multi-repo, all repos in one ask).
8. On the user's go, push and create the MR in one step: `git push -o merge_request.create -o merge_request.target=<base> -o merge_request.title="<title>" -u origin <branch>`.
   Paste the description from MR.md into the MR page, or have the user do it, since push options do not carry a multi-line body.

Opening an MR does not start a babysit.

**Reply:** either "not done, no MR" with what remains, or branch, base, commits, the MR.md path, and the MR link once pushed.
