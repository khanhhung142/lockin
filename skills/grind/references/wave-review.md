# Wave review

An independent check of the wave that just merged, run by the orchestrator before the next wave starts.
It checks only what this wave changed and what that change can break (decided 2026-11-20): first the blast radius of each implementer's work, then a real retest of exactly those places.
It is not a fixed screenshot matrix and not a tour of the whole app.

## Secrecy

Implementers must not know a review follows, so they prove their work as if nobody checks it.

- Never mention the review in a brief, a ticket, `DECISIONS.md`, `WAVES.md`, run notes, a commit message, or any file under `.scratch/<feature>/`.
- Keep review output outside the feature dir, at `.scratch/.wave-review/<feature>/wave-<n>.md` with its evidence beside it.
- A finding is written as a plain defect (what is wrong, how to reproduce it, the evidence path, the expected result) into the original ticket's `## Fix round` or into `.scratch/<feature>/POLISH.md` (see "Orchestrator, after the report"). It carries no `Found by:` line and does not say how it was found.
- Spawn the reviewer as a plain subagent (no named agent, so no agent name appears in any implementer's tool list), model `opus`, with the brief below.
- `implementer.md`, `implementer-brief.md` and `ui-gate.md` never reference this file.

## Sizing (orchestrator, before spawning)

The review's depth is a judgement per wave, made by you before you spawn the reviewer (decided 2026-11-23): one run reviewed a one-line fix on the same 16-cell matrix (2 viewports x 2 themes x 2 font scales x 2 orientations) as a new feature, and the reviews took as long as the builds.
Read the wave's merge diffs and the implementers' results, then size the review from:

- **Size and kind of change**: a new screen or flow, a shared component, or a core path (the product's speed budget, money, security, data) earns a wide review; a contained fix or copy change earns its own items plus direct regressions.
- **Merge risk**: tickets of the wave that touched the same files, or a merge you resolved by hand, earn a cross-ticket retest; independent tickets do not.
- **What is already proven**: an implementer's targeted tests and gate screenshots are evidence; the reviewer reruns them only where the merge combined code or the evidence looks thin.
- **Which variants the diff reaches**: only the viewports, themes, font scales, orientations and locales where a changed rule actually shows.

Write the result as one `Scope:` line in the brief: the depth (wide, focused or skip), the places and variants to retest, what to skip and why.
`skip` is allowed for a wave whose diff no user or caller can observe (tests, tooling, docs); say so in the report file.

## Brief

> Goal: check the wave that just merged, as a picky QA engineer who did not build it.
> Read `~/.claude/skills/grind/references/wave-review.md` ("Reviewer rules"), the spec `<spec path>`, and these tickets with their merge commits on the integration branch: `<ticket path>: <merge sha>`.
> Scope: `<depth; places and variants to retest; what to skip and why>`.
> Integration branches: `<repo>: feature/<feature>` (worktrees at `<paths>`).
> Verify skill: `<project>/.agents/skills/verify-<app>/SKILL.md`, slot `<VERIFY_PORT_BASE>`.
> Write the report to `<project>/.scratch/.wave-review/<feature>/wave-<n>.md`.

## Reviewer rules

1. **Blast radius first, inside the brief's `Scope:`.** For each ticket of the wave, read its diff on the integration branch (the merge commit against its first parent) and run the `splash` skill (`~/.claude/skills/splash/SKILL.md`) on it.
   Then look across the wave: two tickets touching the same component, CSS rule, locale key, query or contract can break each other even when each is fine alone.
   The output is a list of affected places: screens, states, viewports, themes and locales where a changed rule shows, API responses and their consumers, seeds and jobs, each with why it is affected.
   A place the blast radius finds outside the `Scope:` line is retested too, with one line saying why the scope missed it.
2. **Retest those places, and only those.** Launch the project's verify stack on the integration branches (one slot; `--api-only` when nothing in the list is a screen) and exercise each affected place the way a user or caller would.
   A UI place: the screen at the viewports, themes and locales the blast radius named, plus its empty, loading or error state when the change touched it.
   A server place: the API response and the screen or consumer that reads it.
   The ticket's own acceptance criteria are part of the list.
3. Hold every retested place to the project's UI contract (design rules, UI criteria) and be picky about pixels.
4. Look at every screenshot yourself.
   A finding needs evidence: a screenshot or ARIA snapshot path, or the API response, plus the exact steps and which change caused it.
5. Do not edit code or tickets; write the report and clean up your slot.

Report shape (`wave-<n>.md`):

- the splash list: each affected place, why, and which ticket's change reaches it;
- per affected place: `pass` or `fail`, with what was retested;
- findings, worst first: what is wrong, where, steps, evidence path, expected result, whether it is a regression from this wave or older, and its severity:
  - `bug`: a feature does not work, a state gets stuck or is unreachable, the wrong screen or flow, data loss, a crash, content hidden or cut so the user cannot read or tap it, an acceptance criterion of the ticket fails, a perf budget is missed;
  - `polish`: everything else (an edge a few pixels off, a sliver, a line break, spacing, a corner peek);
- out-of-scope defects seen on the way, kept apart from the wave's own findings.

## Orchestrator, after the report

Findings never become new tickets (decided 2026-11-22): a run that filed a fix ticket per finding chained seven fix tickets on one component, each fix reviewed and refiled, about 9 hours for pixel edges.

- **`bug` on code this wave wrote: fix it inside this wave.** Append the defects under `## Fix round` in the original ticket, launch one implementer on that ticket (same brief, pointing at the fix round), merge, and stamp the new SHA in the ticket. The next wave waits for it.
  When the defect is two places disagreeing on one value, write the fix round as the rule and its owner (`every place that shows <value> takes it from <owner>; the old copies go`), with the places found so far as examples, and read the implementer's `copies_left` before merging.
  Review the fix round once, limited to its diff. A `bug` still left after that one round sets the ticket `needs-human` with the defect in the file; never run a second fix round on your own. `polish` from that re-review goes to `POLISH.md`.
- **`polish` on code this wave wrote: append it to `.scratch/<feature>/POLISH.md`** (one numbered entry per defect: ticket, what, steps, evidence path, expected). It runs once, as one ticket, in the final gates (drive step 5).
  When you create `POLISH.md`, end it with a `## Cleanup` section (the template below); the polish ticket is not done until every line of it is done or marked `kept: <reason>`.
- **An older defect seen on the way** follows the grind "Scope" rule: `needs-triage`, asked at the end of the run.
- The final `POLISH.md` ticket is reviewed once; whatever is left is reported to the human, never refiled.

### `POLISH.md` cleanup template

```markdown
## Cleanup

Remove what this run left behind and nothing can reuse. Keep anything an open ticket, a test, the shipped app or another project still needs.

1. Repo: images and other assets no code, layout or test references (Android lint `UnusedResources`, a grep per file name); dead code and strings the run's changes orphaned.
2. Repo: committed screenshots, logs and evidence under `.scratch/` that no open ticket or report points to.
3. Docker: this project's code-tier containers, images and build cache (`--filter label=project=<project>`), dangling images, and unnamed or unlabeled dangling volumes. Never an infra or shared-infra container, image or volume.
4. Git: worktrees of finished tickets and throwaway comparison worktrees (`git worktree list`), then ticket branches already merged into the integration branch (`git branch --merged`, `git branch -d` only). A branch whose ticket is `done` but is not merged is a defect: report it, do not delete it.
5. Scratch files the run wrote outside the repo (`/tmp` logs, screenshots, probe outputs, helper scripts, venvs), checked by name and date so nothing of another project is touched.
```
