---
name: scout
description: "Generate a project-local verify-<app> skill that launches the real app, drives it the way a user does, and captures evidence, plus a feature map (one file per user-facing feature). Use for /scout, 'make a verify skill for this repo', or when a project has no scripted way to prove UI, CLI or API behaviour."
disable-model-invocation: true
---

# Scout - create a verification skill

Every serious project needs a scripted way to drive the real app and prove behaviour: launch it, exercise a feature the way a user would, and capture evidence.
This skill generates that as a project-local skill tailored to the repo.
You write the output for the next agent, not for a human: it will be read cold, mid-task, by an agent that has never seen the app.

## Where the generated skill lives

- **Multi-repo project** (a plain project folder holding several git repos, the usual case): the skill lives at project level, `<project>/.agents/skills/verify-<project>/`, outside every repo and unversioned.
  Launch starts every service the user path crosses, from each repo's current checkout, health-checks each one, and Doctor prints each repo's branch and commit.
  Scripts resolve repos as `$PROJECT/<repo>`; a JS driver ships its own `package.json` in the skill dir instead of borrowing a repo's `node_modules`.
- **Env convention** (every verify skill, so grind implementers and the weekly rescout pass can run it against other checkouts, side by side):
  `VERIFY_<REPO>_DIR` points a repo at another checkout (`<REPO>` is the repo dir name uppercased, non-alphanumerics as `_`, for example `VERIFY_WEB_CLIENT_DIR`), `VERIFY_<REPO>_URL` points a repo's service at an instance already running and skips launching it, `VERIFY_PORT_BASE` moves every port, and `VERIFY_DB` names the database; run state is kept per port base.
  Document them in the generated SKILL.md and prove one parallel run on a worktree.
- **Single-repo project**: `<repo>/.agents/skills/verify-<app>/`, committed on a `chore/verify-<app>` branch off the integration branch; never push without the user's go.
- Either way: real directory under `.agents/skills/` (pi reads it from the working directory upward), plus symlinks `.claude/skills/verify-<app>` and `.cursor/skills/verify-<app>` next to it, both pointing at `../../.agents/skills/verify-<app>`.
- Agents start from the project folder, so the skill's paths are relative to it.

## 1. Interview the repo, not the user

Answer these from the codebase, and ask the user only what you cannot observe:

- **Surface**: what a user actually touches (web UI, CLI, API, Flutter app embedding a webview).
  A repo can have several; pick the primary one and note the rest.
- **Run**: how the app starts locally.
  Prefer the repo's own dev command (package scripts, Makefile, README); note ports, env vars, config templates, migrations, seed data and auth.
- **Infra**: databases, caches and queues come from `~/shared-infra` (`docker compose up -d <service>`, root password `root`) with this project's own database name, key prefix or topic prefix.
  Never start a second container for an engine already running there; read `~/shared-infra/README.md`.
- **Drive**: how an agent can interact programmatically.
  Existing harnesses first: Playwright specs and config, curl-able endpoints, a debug port.
  For a web UI the default is a small Node script on the repo's installed Playwright that exposes `click`, `fill`, `press`, `goto`, `snapshot` (ARIA) and `screenshot` subcommands against one persistent browser context.
  The `test-guard` hook blocks bare `playwright test`, so the driver must not shell out to the test runner without a spec path.
- **Observe**: what evidence can be captured: screenshots, ARIA snapshots, response bodies, server logs, exit codes, DB rows.
- **Isolate**: whether two instances can run side by side (ports, database names, data dirs).
  If not, say so in the generated skill: refusing to drive a shared instance beats corrupting someone's session.

If the checkout does not build or start as-is, fix that first or report it precisely before generating; a skill written against a broken base teaches wrong steps.
When an irrelevant missing asset blocks startup (a sample config, a static dir the API never serves), the generated skill may create it, clearly marked as verification scaffolding, and remove it in cleanup.

## 2. Generate the skill

Write `SKILL.md` with frontmatter (`name: verify-<app>` and a `description` that names the app, the surface, and when to reach for it) and these sections, each grounded in what the interview found, with no placeholders left:

- **Launch**: the exact command that starts the app for verification, and how to tell it is ready.
  Launch reaches a usable state from an empty database, including migrations and seed data (an idempotent seed script checked into the repo).
  Ready means usable, not just that a process answers.
  Launch reuses before it builds: for each service, when an instance at the needed commit already runs (container `<project>-<service>-<short-commit>`, or the URL in `VERIFY_<REPO>_URL`), it uses that one and starts only what is missing.
  Every container it starts is named with the commit it was built from and carries the global Docker labels, `commit=` included.
  Include teardown.
- **Doctor**: one read-only check that answers "is this instance worth driving?": processes up, right build or commit (printed per service, reused or started), ports owned by this run, database reachable and seeded, auth valid.
  An agent runs it first, and again whenever anything looks off.
- **Drive**: the harness recipe with real selectors and commands from this repo, not examples.
  Prefer stable handles (ARIA roles and accessible names, `data-testid`, route paths, prompt strings) over coordinates and tab order.
- **Evidence**: what to capture for a proof and where it goes (a named directory outside anything cleanup deletes, for example `.scratch/verify-<app>/<run-id>/`).
  Proof standards: exercise the real user path, not internal setters or test-only endpoints; capture the action and the resulting state, not just the final screen; verify side effects (rows inserted, files written, messages sent) alongside what is visible; mocks only where a production boundary already isolates the external system.
  When the safe path is a dry-run or test mode, verify what it actually skips by observing rather than trusting its name.
- **Cleanup**: tear down what the run started.
  Never kill by process name; kill the PIDs this run recorded.
  Never stop an instance the run reused instead of starting.
  Cleanup removes instances and scratch state, never the evidence, and never shared-infra containers or volumes.
- **Helpers**: every script the skill ships is executable, and its invocation is shown in the skill body.
  A helper the reader has to reverse-engineer is not a helper.

## 3. Seed the feature map

Create `features/README.md` plus one file per user-facing feature you can identify (the top 3-5 to start, from routes, menus, API groups or docs).
Follow the shape in [`references/feature-map-example/`](references/feature-map-example/): a README index (baseline preconditions, driving conventions, proof and skip reporting) and one file per feature.
Each feature file answers, from the user's point of view: what the feature is, how to reach it, how to drive it with the harness, and what observable end state proves it works.
The four H2s are `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, and `Gotchas`.
The shape is enforced, not suggested: `node ~/.claude/skills/scout/scripts/check-feature-map.mjs <skill-dir>/features` must exit 0 before step 4 (README H2s, every file linked, four H2s in order, `Preconditions:`, labeled steps ending in `Proof.`, no source paths).
If the seed data lacks a precondition a journey needs, the journey reports a failure and the reason goes in that feature's `Gotchas`.
Never weaken a journey to make it pass.
The map is the repo's maintained verification source; a proof that drives one convenient entry point is incomplete when the map lists others.

## 4. Prove the generated skill before handing it over

Run its own instructions end to end once: launch, doctor, drive one mapped feature, capture evidence, clean up.
After cleanup, confirm the evidence still exists at the named location; a cleanup that eats the proof fails this step.
Fix what fails, and run the generated cleanup after every failed iteration too, so broken attempts do not strand processes and ports.
A generated skill that was never executed is a draft, not a deliverable.
If you proved it in a stand-in for the real target, list every setup step the stand-in did that the target will not; those stay unverified.

## 5. Hand over

Point the user at `/rescout` for keeping the map honest as the app changes.
Add one navigation line to the project `AGENTS.md` (the repo's, for a single-repo project): "To prove a change works, use the `verify-<app>` skill."

Adapted from `scout` in Lauren Tan's pstack (MIT, see `LICENSE-pstack`).
