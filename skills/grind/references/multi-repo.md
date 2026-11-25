# Multi-repo projects

Most of the user's projects are a plain folder holding several git repos (microservices, a client and a server, a proto repo).
The project folder itself is never a git repo.
Its `AGENTS.md`, `.scratch/`, `.agents/skills/` and `GLOSSARY.md` are local, unversioned files.

## Terms

- **Project folder**: the parent of `.scratch/`, for example `~/work/shop`.
- **Repo**: a direct child of the project folder with its own `.git`.
- **Base branch**: per repo, the root every release starts from, usually production (`main`); from the repo table in the project `AGENTS.md`.
- **MR target**: per repo, the branch MRs go into, from the same table; never `main`/`master`.
  A pattern such as `version/<xx>` is a release branch: which `<xx>` a feature ships in is a business question settled at spec time.
  When that branch does not exist yet, create it locally from the base branch; pushing it needs the user's go.
  Missing or ambiguous is a business question for the user.
- **Integration branch**: `feature/<feature>` in every repo the feature touches, cut from that repo's MR target.
  Same name in every repo, so the stack can be checked out together.
- **Deploy merges** (for example the MR target into `dev` or `stage` to get a build) are the user's, never part of a run.

A project folder that is itself a git repo is the single-repo case: everything below collapses to one repo, and `Repo:` lines are optional.

## Tickets

- Every ticket carries one `**Repo:** <repo-dir>` line and touches only that repo.
  A ticket that needs two repos is split before the run (technical decision, log it in `DECISIONS.md`), with the consumer ticket `Blocked by` the provider ticket.
- `grind.sh check <feature-dir>` fails on a missing, unknown or multi-valued `Repo:`; run it in step 1 and fix the tickets before any wave.
- A change to a contract (proto, OpenAPI, event schema, shared DB schema, shared library) is its own ticket in the repo that owns the contract, and the consumers are blocked by it.
  The wave checkpoint's blocking first steps list it.
- Contracts change backward-compatibly, so each repo's MR can merge on its own, provider first.

## Running waves

- Create the integration branch in each touched repo before the first wave (`grind.sh repos <feature-dir>` lists them).
- Each implementer's brief names its repo; it creates its worktree inside that repo, at `<project>/.worktrees/<repo>/<NN>-<slug>`, off that repo's integration branch.
- Disjoint repos are independent workstreams by construction; two tickets in the same repo follow the normal shared-file rules.
- Repos a ticket does not change run once, at their checked-out commit, and every implementer of the wave shares that instance (implementer `Infra`); only the repo under change is built from the worktree.
- Merge each finished ticket into its own repo's integration branch.
  Ticket status lives in the ticket file on disk; it is committed only when `.scratch/` sits inside a git repo.
- Resume reads ticket statuses plus `git log feature/<feature>` in every touched repo.

## Final gates

- Full suite (`FULL=1`): once per touched repo, on its integration branch.
- `code-review` and spar: one scope per touched repo (that repo's integration branch against its base branch), launched in parallel.
  Adversaries may also break the stack across repos; their command then runs from the project folder.
- Verification: the project's `verify-<project>` skill at `<project>/.agents/skills/`, with every touched repo checked out at its integration branch.
  Verifying one repo alone is not a pass for a cross-repo feature.
- Spec coverage: one `spec-auditor` that gets every touched repo and its integration branch.

## Shipping

`opening-an-mr` opens one MR per touched repo, each into that repo's MR target, only when the whole feature is done.
The MR descriptions link each other and state the merge order (contract providers first).
