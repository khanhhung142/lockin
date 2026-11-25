---
name: ref
description: "Audit a project's prose rules (AGENTS.md, docs, design rules) against the code, fix real violations, and turn every rule code can check into a fast deterministic structural test or lint rule, so agents stop re-checking rules by reading. Use for /ref."
disable-model-invocation: true
---

# Ref - structural tests

A **structural test** checks the shape of code, not its behaviour: who imports whom, which API is allowed where, where files live, that generated files match their generator, that every query is scoped to the tenant.
A **prose rule** is a rule that lives only in text (AGENTS.md, docs, design rules, review comments).
An agent obeys a prose rule most of the time and forgets it some of the time; it also burns tokens re-reading code to check it.
Your job: every prose rule that code can check becomes a **check** that goes **red** on a violation, with a message that says the fix.
Checks are deterministic only: tests, lint rules, small scripts.
AI review and "LLM as judge" are out of scope.

Scope: `/ref` covers every repo in the current project folder; `/ref <repo>` covers one.
Work file: `.scratch/ref/rules.md` in the project folder (or the repo when there is no project folder).
Recipes per kind of rule and per stack: [`references/recipes.md`](references/recipes.md).
Load the `writing-for-agents` skill before you edit any AGENTS.md.

## Steps

### 1. Harvest the rules

Read every steering source: AGENTS.md / CLAUDE.md at every level, `.claude/rules/`, `.cursor/rules/`, `docs/index.md` or equivalent, design rules, ADRs, CONTRIBUTING, and `DO NOT EDIT` headers on generated files.
Read the lint, typecheck, test and CI config too, so you know what is already enforced.

Write one row per rule into `rules.md`: rule, source (file:line), class.

- **checkable**: code can decide it (imports, forbidden calls, file location, naming, generated-file drift, SQL predicates, request fields, git history, token usage).
- **judgment**: needs taste or product knowledge (UX quality, naming that reads well, which size a font should be); it stays prose.
- **enforced**: an existing lint rule, type or test already makes it go red; cite it.

A convention the code follows everywhere but no doc states may become a row marked `implicit`; one the code follows only partly is a question for the project owner, not a rule.

Done when every imperative sentence in those sources ("must", "never", "only", "always", "do not", and the same words in the docs' language) is a row.

### 2. Audit the code against each checkable rule

Run the existing lint, typecheck and the tests that cover what the rules touch, per package, never the whole suite.
For each checkable row, find the current violations with a reproducible command (grep, import listing, regenerating into a temp dir, git diff) and record: `clean`, or each violation with its path and line, or `intentional` with the reason the code gives.

Done when every checkable row has a status and the command that produced it.

### 3. Fix, allow, or ask

- A technical violation (hand-edited generated file, wrong layer, hardcoded value with an obvious token, lint warning): fix it.
- An intentional exception: keep it, and plan an allowlist entry with its reason inside the check.
- Too many violations to fix in one reviewable change (legacy code): keep a baseline list of the current offenders inside the check, fail only on new ones, and fail too when a baselined entry is gone so the list only shrinks.
- A violation whose fix is a product or design choice (what users see, copy, a new design token value, a permission): ask the project owner in one batch, and keep working on everything the answer does not block.

Done when every violation is fixed, allowlisted, or listed as an open question.

### 4. Write the checks

Pick the cheapest mechanism that goes red reliably, in this order:

1. A rule in a linter the repo already runs (`depguard`, `forbidigo`, `no-restricted-imports`, `no-restricted-globals`, ArchUnit, an existing dependency-cruiser config).
2. A test in the repo's own test runner, parsing source with the language's AST package rather than regex where it can.
3. A small script in the repo's language, with no new dependency.

Every check:

- states the fix in its failure message (`handler imports model: call internal/logic instead`), so the agent reading it can act without opening the docs;
- is **tight**: the whole set runs from **one command per repo** in a few seconds;
- skips with a message, never fails at random, when something it needs is absent (a generator binary, git history, a base branch), and the skip names what is missing;
- keeps allowlisted exceptions next to the rule, each with a one-line reason;
- reads non-test source only, and matches what the rule means (a CSS selector `#root` is not a color).

When a check needs non-trivial matching (a regex, a SQL extractor), assert the matcher on one positive and one negative sample inside the check.

Done when each checkable row names its check and the one command runs green.

### 5. Prove every check goes red

For each rule: inject one violation (an import, a call, a field, an edited migration), run the command, see it go red with the expected message, then restore the file with git.
Record `proved red` on the row.
A check you have not seen go red is not done.

### 6. Prove the fixes did not change behaviour

Fixes from step 3 that touch runtime code (moved middleware, refactored state handling, new tokens in CSS) get an end-to-end run the way a user would: the project's `verify-<project>` skill when it has one, otherwise the app run locally.
Look at every screenshot and report anything that looks off, even outside this task.

Done when every runtime-touching fix has evidence (snapshot, screenshot, response) or is listed as unverified with the reason.

### 7. Wire it in

- Add the command to each repo's AGENTS.md command table with one line: "Fail: fix what the message says; do not re-check these rules by reading code."
  Keep each prose rule in AGENTS.md (agents still need it up front), and correct any rule the audit showed to be wrong.
- If the repo's CI config is its own and already runs the test runner or linter, the checks ride along.
  If CI comes from a shared template, leave it alone and report that the checks run only locally.
- In a lockin project, run `node ~/.claude/skills/warmup/scripts/check-project-docs.mjs .` and fix every `FAIL`.
- Commit locally on the current branch: the fixes in one commit, the checks in another; only files you changed, never pre-existing dirty files; bump the version file if the repo requires it for the paths you touched.
  Never push.

## Hand over

Reply with:

- a table per repo: rule, check (file and name), command;
- violations found: fixed, allowlisted (reason), or waiting on a question;
- rules kept as prose, each with why code cannot check it;
- the open questions;
- what you could not verify, and the local commits per repo.

Markdown you write: one sentence per line, no em dash.
