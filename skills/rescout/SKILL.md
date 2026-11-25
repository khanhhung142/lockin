---
name: rescout
description: "Periodic pass that keeps a project's verify-<app> skill and feature map honest: parallel read-only source readers per feature, one live session driving every feature, then one commit of proven corrections. Use for /rescout or 'audit the verify skill'."
disable-model-invocation: true
---

# Rescout - maintain a verification skill

A feature map rots the moment the app changes.
This is the upkeep loop for a skill made by `/scout`, or any project-local verification skill with a feature map.
The unit of rigour is the feature, not every sentence: cover every feature file from source and exercise every feature live.

## Outcomes

Pick one, and say which:

- **clean**: every feature got source and live coverage; nothing worth changing.
  No branch, no commit.
- **changed**: one commit of proven doc, harness or map corrections, on a branch, pushed only on the user's go.
- **blocked**: coverage could not finish, or a proven fix could not land safely.
  Say exactly what blocked it.

**Weekly full pass**: `scripts/weekly.sh <project>` fetches each repo's base branch (the "Base branch" column of the project `AGENTS.md`), refreshes detached worktrees at `<project>/.worktrees/<repo>/maintain-weekly`, exports the `VERIFY_*` env convention, and runs this skill unattended (`claude -p`), ending in a macOS notification with the outcome.
`WEEKLY_BRANCH=<branch>` overrides the base branch for every repo and `WEEKLY_FETCH=0` uses the refs already on disk, `WEEKLY_PULL=1` also fast-forwards main checkouts sitting on that branch (for projects whose stack tracks another branch or whose agents must not fetch); pass them, and `VERIFY_PORT_BASE` when the skill constrains it, to `--install` and the schedule keeps them.
`--install <project>` schedules it with launchd (Monday 09:00; a missed run fires on wake), `--uninstall` removes it, `--dry-run` shows the worktrees and the prompt without running.

**Scoped pass**: grind's docs sync calls this with the features a run touched.
Then the source wave and live pass cover only those features (plus any new surface), while index hygiene and the shape check still cover the whole map.
A scoped pass does not reset the clock: a full pass is due when `check-project-docs.mjs` warns that the last one is a week old and code moved since.
Name notes for a scoped pass `maintain-<date>-scoped.md`, so only full passes count as the last full pass.

## Edit scope

Edit only the verification skill's own directory (`.agents/skills/verify-<app>/`: SKILL.md, `features/`, and the harness scripts it owns).
Never edit product code during a run.
A behaviour the map describes that the app no longer does is either doc drift (fix the map) or a product regression (report it to the user, do not paper over it in the map).
A product defect the pass finds (regression or not) becomes a ticket with `Status: needs-triage`, `Found by: rescout` and its evidence path, in the feature dir that owns the surface; never build it in this pass, and source-reader subagents never file tickets (they return drift, you file).

## Pass

0. **Locate the target**: the project-local skill with Launch and Drive sections and a feature map, usually `.agents/skills/verify-*/`.
   Several candidates: ask which.
   None: stop and point at `/scout`.
1. **Index hygiene**: read `features/README.md` and list its sibling files.
   Fix missing, extra, duplicate or dead entries.
   Run `node ~/.claude/skills/scout/scripts/check-feature-map.mjs <skill-dir>/features`; every problem it lists is shape drift to fix in this pass.
2. **Source wave**: one `source-reader` subagent per feature file, launched in parallel in the background.
   Brief it with pointers only: the feature file to check, the repo roots, and "recipe wanted".
   The agent definition makes it read-only, cite `file:line`, flag drift, and return summary, entry points, drift or none, and one live recipe.
3. **Reconcile**: every feature file has a returned summary.
   Merge overlapping recipes into as few app states as practical.
   Spot-check cited drift; do not re-prove clean claims.
   Sweep recent commits for user-facing surfaces missing from the map, and require a concrete source path before calling one missing.
4. **Live pass**: required even when source looks clean.
   You own all driving, following the skill's own Launch model.
   Exercise every feature at least once and hold three invariants the whole pass:
   - never drive an instance you have not health-checked since it last did something surprising (doctor before the first drive and after any failed drive; when doctor cannot see the failure, reset or relaunch);
   - evidence captured so far survives every cleanup, checked at its named location;
   - nothing a drive started outlives its usefulness, and shared-infra containers are never stopped or wiped.

   A doctor failure caused by skill drift is drift: fix it within edit scope and retry once before calling the pass `blocked`.
   A feature that cannot be reached is `verified-unreachable` only with the concrete prerequisite and the route attempted; if the map omits that prerequisite, that is drift.
   Any harness fix gets re-driven live before it lands.
   Final teardown happens after the last drive, re-proofs included.
5. **Triage**: wrong or missing user-POV description is doc drift, so fix it.
   Working behaviour the harness cannot drive is a harness gap, so fix it (scripts executable, invocation documented).
   App behaviour that is actually broken is a product gap: record it for the user and keep it out of this commit.
6. **Land or stop**: for `changed`, re-read every changed file and rerun the shape check (exit 0), then commit.
   For `clean` or `blocked`, no commit; report the outcome and the coverage honestly.

Keep short run notes (features covered, unreachable prerequisites, confirmed drift, outcome) in `.scratch/verify-<app>/maintain-<date>.md`; do not commit them.

Adapted from `rescout` in Lauren Tan's pstack (MIT, see `../scout/LICENSE-pstack`).
