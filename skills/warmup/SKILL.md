---
name: warmup
description: "One-time setup that makes a project folder ready for /lockin and /grind: project and repo AGENTS.md, glossary and ADRs, shared-infra DB with a seed in the schema-owning repo, a verify-<project> skill with a pstack-shaped feature map, and design-rules.md. Use for /warmup, 'prepare this project for lockin', or the first session in a new project."
disable-model-invocation: true
---

# Warmup

Prepare the current project folder so `/lockin` and `/grind` run in it without a setup conversation.
Read first: the lockin `README.md` (`~/.claude/skills/lockin/../../README.md`) and `~/.claude/skills/grind/references/multi-repo.md`.
The project folder is not a git repo and must never be `git init`ed; only the repos inside it are.
Project-level files (`AGENTS.md`, `GLOSSARY.md`, `docs/`, `.scratch/`, `.agents/`) are local and unversioned.

## Ask the user first, in one batch

These are business questions; never default them.
Read the repos first so each question comes with the candidates you found.

1. The git flow, per repo: the base branch (usually production), the MR target (`mr_guard` blocks MRs into `main`/`master`; often a release pattern such as `version/<xx>` cut from the base), and how a release reaches a build (for example merging it into `dev` or `stage`, which only the user does).
2. Who hosts or embeds the UI (another app, an iframe host, a mobile shell), and where its code lives.
3. Which layouts the UI must support: desktop, mobile, dark mode.
4. The design source: Figma link, wireframe, or "the host app itself".

Keep working on everything the answers do not block.

## Work, in order

Technical decisions: decide, log one line each to `.scratch/warmup/DECISIONS.md`.
Commit only on a local branch `chore/warmup` cut from each repo's base branch; never push, never open an MR, never commit files you did not change (leave pre-existing dirty files alone).

1. **Project `AGENTS.md`**, with `CLAUDE.md` as a symlink to it.
   Repo table: what each repo does, stack, base branch, MR target, contracts it owns.
   Who calls whom, including hosts and services outside the project (name their repo path).
   Data: database names, Redis/Kafka prefixes on `~/shared-infra`, seed paths.
   Where knowledge lives: glossary, ADRs, product source of truth, design rules, `.scratch/<feature>/`.
   Do not restate the global Docker rules.
2. **Repo `AGENTS.md`** in every repo, short: build, test per package (never the whole suite), lint, one way per pattern, git rules.
   Run each command you write down; fix lint failures in their own commit.
   Fix docs that contradict the code while you are there.
   Then suggest `/ref` to the user: it turns the checkable rules you just wrote into checks.
   If the repo's `.gitignore` lists `AGENTS.md`, ask the user before un-ignoring it.
3. **`GLOSSARY.md` and `docs/adr/`** at project level via the `domain-modeling` skill: terms without implementation detail, ADRs only for hard-to-reverse, surprising trade-offs.
4. **Infra and seed**: every engine comes from `~/shared-infra` with this project's own database or prefix.
   The idempotent seed lives in the repo that owns the schema (for example `<server>/seed/local.sql`), never only inside a skill directory.
5. **Verification skill** `.agents/skills/verify-<project>/` (symlinked from `.claude/skills` and `.cursor/skills`): `/scout` when missing, otherwise `/rescout`.
   Launch starts every service on the user path, health-checks each, and drives one end-to-end journey.
   A host or upstream outside the project that cannot run locally is faked at its boundary, mirroring its real code, and the fake names that file.
   Support the env convention of `/scout` (`VERIFY_<REPO>_DIR`, `VERIFY_PORT_BASE`, `VERIFY_DB`) so grind implementers and the weekly pass verify their own checkout.
   Install the weekly pass: `~/.claude/skills/rescout/scripts/weekly.sh --install <project>`.
   The feature map must pass `node ~/.claude/skills/scout/scripts/check-feature-map.mjs .agents/skills/verify-<project>/features`, and every feature is driven live before you hand over.
6. **`design-rules.md`** in the UI repo when there is a UI: from Figma, the wireframe or the host app, never guessed; it states supported layouts and the UI-gate viewports, and the project `AGENTS.md` says every UI spec names it.

## Large projects: fan out

With more than a handful of repos or features, the main agent only inventories, asks, merges and drives the gates; subagents do the reading and writing.
Keep briefs pointer-only, give each subagent exactly one repo or one feature so no two write the same file, and cap every return at one screen.
Launch in batches up to the subagent tool's limit (pi: 8 per call, 4 at once) and start the next batch as soon as one returns.

1. **Inventory (main agent)**: per repo, the branch, remote branches, existing `AGENTS.md`/`CLAUDE.md`, build files and docs.
   Send the business-question batch to the user right away, with the candidates you found.
2. **One subagent per repo** (`implementer` for repos that get commits, `source-reader` for read-only ones): write or refresh that repo's `AGENTS.md` and run every command in it, then return what the service does, whom it calls and who calls it (from config and clients), the contracts it owns, its databases and prefixes, and its user-facing surfaces with source paths.
3. **Merge (main agent)**: the project `AGENTS.md` and its call graph from those returns.
4. **One subagent per domain-doc area** (wiki section, spec folder): candidate glossary terms and hard-to-reverse decisions with sources; the main agent merges them into `GLOSSARY.md` and `docs/adr/` through `domain-modeling`.
5. **Verify skill**: the main agent builds and proves the harness (launch, doctor, one journey, the env convention) first.
   Then one `source-reader` per user-facing feature writes that feature's file from the surfaces step 2 found; the main agent writes the README index and runs the shape check.
6. **Live pass in parallel**: one subagent per group of features, each with its own `VERIFY_PORT_BASE` and `VERIFY_DB`, at most 3 at once (heavier load stalls browser attaches); each runs the skill's cleanup and returns proven drift and product bugs.
7. **design-rules.md**: one subagent per UI repo.

A feature the harness cannot reach yet stays in the map as `verified-unreachable` with its prerequisite; a large project's first map can be partial, as long as the README says which surfaces are not mapped yet.

## Keeping it true

These files rot as the code moves; nothing here relies on someone remembering.

| File | Goes stale when | Updated by | Caught by |
| --- | --- | --- | --- |
| Project `AGENTS.md` | a repo, branch, contract, host or database changes | grind docs sync; `/warmup` rerun | `check-project-docs.mjs`: dead paths, missing branches |
| Repo `AGENTS.md` | a build, test or lint command, or a prescribed pattern changes | the implementer whose ticket changes it, same commit | warning when build or lint config changed after it |
| `GLOSSARY.md`, `docs/adr/` | a new term, a shifted meaning, a hard-to-reverse decision | `domain-modeling` during shape and spec; grind docs sync | dead paths in ADRs |
| `design-rules.md` | The user decides a UI rule; the design source or host changes | spec phase; the UI ticket that hits it | dead paths |
| Verify skill and feature map | anything a user sees changes | grind docs sync (scoped `/rescout`); a full pass weekly on the latest base branches (`rescout/scripts/weekly.sh`, launchd) | `check-feature-map.mjs` (shape); warning when the last full pass is 7+ days old and code moved |

The checks run in three places: when `/lockin` turns on, in grind's docs-sync gate, and at the end of this skill.
`node ~/.claude/skills/warmup/scripts/check-project-docs.mjs <project>`: `FAIL` lines are wrong facts and block; `warn` lines are staleness hints.
Write a short "Keeping these docs true" section into the project `AGENTS.md` that points here.

## Hand over

Run `check-project-docs.mjs` last; hand over only with no `FAIL` lines.

Reply with:

- a table of the six items: already there, done now, still missing;
- the open questions for the user;
- the local commits per repo (`git log <base>..chore/warmup`);
- the feature map: one row per feature file with its sub-feature IDs and what is `verified-unreachable` and why;
- the product bugs the live pass found, kept out of the commits.

Markdown you write: one sentence per line, no em dash.
