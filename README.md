# lockin

An agent workflow as one pack, for Claude Code, pi and Cursor.
Go deep first, then let agents run unattended behind gates that prove the work.

You type `/lockin <task>` once.
From then on every message is routed through one gated flow: settle what to build, write the spec and tickets, build them unattended, prove them in the real app, ship, and learn from the mistakes.
The mode stays on until `/lockin off`.

## Quick start

```sh
git clone https://github.com/khanhhung142/lockin.git
cd lockin
./install.sh --check       # report what is installed or missing, change nothing
./install.sh               # symlink skills, agents, hooks and pi extensions; wire the hooks
./install.sh --with-deps   # also install the dependency skills listed in deps.txt
```

Then open a new agent session in a project folder:

```text
/warmup                    # once per project: AGENTS.md, glossary, seed data, verify skill, design rules
/lockin add CSV export     # start working; every later message is routed
/lockin off                # leave the mode
```

Everything is a symlink back into this repo, so `git pull` plus a new agent session is an update.
Rerun `./install.sh` after a pull that adds, renames or removes a skill; it links the new names and removes dangling links.

## The flow

```text
warmup ─► lockin ─► huddle ─► /to-spec ─► /to-tickets ─► grind ─► ship (MR) ─► replay
 (once)   (mode)    gate 1       gate 2      gate 3         unattended  gate 4      (learn)
```

| Step | What happens | Gate (the user decides) |
| --- | --- | --- |
| `warmup` | One-time project setup so agents need no setup conversation. | - |
| `huddle` | Round-by-round questions until the core behaviour is clear. | Gate 1: the behaviour is right. |
| `/to-spec` | One authoritative spec; business questions settled, not defaulted. | Gate 2: the spec. |
| `/to-tickets` | The spec split into tickets with blockers under `.scratch/<feature>/issues/`. | Gate 3: go to build. |
| `grind` | Builds the tickets wave by wave in worktrees, each proven once, then reconciles the whole spec. | Business questions block only their own ticket. |
| ship | `opening-an-mr` playbook, never into `main`/`master`. | Gate 4: push and open the MR. |
| `replay` | Finds repeated mistakes and fixes their cause (lint rule, hook, test, skill), with backups. | - |

Single-owner work (a bug, a refactor, a perf issue, an investigation) skips the ticket flow and goes to `playbook`.

## Skills

| Skill | What it does |
| --- | --- |
| `lockin` | Sticky mode and router; every message goes through the flow above. |
| `warmup` | One-time project setup: project and repo `AGENTS.md`, glossary and ADRs, shared-infra DB seed, a `verify-<project>` skill, `design-rules.md`. |
| `huddle` | Shapes a plan or feature with the user, one round of questions at a time, each with a recommended answer. |
| `grind` | Resumable multi-ticket orchestrator: waves, worktrees, verify-once, UI and perf gates, arena, spar, spec coverage, replay report. |
| `playbook` | 23 step-by-step playbooks for single-owner work, with usage logging for pruning (`playbook.sh report`). |
| `replay` | Mines sessions for repeated mistakes and fixes each at the highest level that works. |
| `lore` | Why something is the way it is, cited from commits, MRs, ADRs and decision logs. |
| `splash` | What a change could break outside its diff, with the one safety fact proven by running code. |
| `spar` | Adversaries on different models try to break a change; a finding survives only when a command proves it. |
| `scout` | Generates a project `verify-<app>` skill that drives the real app, plus a feature map. |
| `rescout` | Keeps the verify skill and feature map honest; runs scoped after a grind and fully every week. |
| `ref` | Turns prose rules (AGENTS.md, docs, design rules) into fast deterministic tests or lint rules. |

Skills lockin routes to but does not ship are listed in `deps.txt` (Matt Pocock's `to-spec`, `to-tickets`, `tdd` and others).

## Other parts

| Path | What |
| --- | --- |
| `agents/` | Named subagents the skills spawn: `implementer`, `adversary`, `judge`, `claim-checker`, `source-reader`, `spec-auditor`. |
| `hooks/test_guard.py` | Blocks whole-suite test runs unless prefixed with `FULL=1`. |
| `hooks/mr_guard.py` | Blocks pushes and MRs into `main`/`master`. |
| `hooks/worktree_guard.py` | Blocks `git -C <repo> worktree add <relative path>`, which would land the worktree inside the repo. |
| `hooks/checkout_guard.py` | Blocks branch switches in a repo's main checkout; agents read other branches with `git show` or a worktree. |
| `hooks/lockin_mode.py` | Keeps `/lockin` sticky in Claude Code. |
| `pi/extensions/lockin` | pi: the `subagent` tool (single, parallel, chain; a model per agent) and sticky `/lockin`. |
| `pi/extensions/guards.ts` | pi: runs the four guard hooks before every bash call, like Claude Code and Cursor. |
| `pi/extensions/questionnaire.ts` | pi: the `questionnaire` tool (options UI, tabs, returns "no answer" after `timeoutMinutes`); grind asks blocking questions through it. |
| `install.sh` | Symlinks everything into `~/.claude`, `~/.pi/agent`, `~/.cursor` and `~/.agents/hooks`, and wires the hooks. |

## Keeping project docs true

Project docs (`AGENTS.md`, glossary, ADRs, design rules, the verify skill's feature map) rot as code moves.
`skills/warmup/scripts/check-project-docs.mjs <project>` fails on provably wrong facts (dead paths, missing branches, a feature map off the pstack shape).
It warns on staleness (build config changed after a repo `AGENTS.md`, a week since the last full `/rescout` while code moved).
The check runs when `/lockin` turns on, in grind's docs-sync gate, and at the end of `/warmup`.
A weekly full `/rescout` pass runs unattended on each repo's latest base branch (`skills/rescout/scripts/weekly.sh --install <project>`, launchd).
Who updates which file is the "Keeping it true" table in `skills/warmup/SKILL.md`.

## Requirements

- macOS or Linux with `bash`, `python3` and `node` (launchd scheduling is macOS only).
- At least one of Claude Code, pi or Cursor.
- Optional companions: the `caveman` and `ponytail` Claude Code plugins, and `ui-ux-pro-max` (grind's UI gate prefers it).

## Development

Read `AGENTS.md` before changing anything; it explains the moving parts, the names that must stay stable, and the checks to run.

## Credits

Several skills are adapted from Lauren Tan's pstack (MIT, see each `LICENSE-pstack`), and the pi subagent tool from kkgogogo17's pi-pstack (MIT).

## License

MIT, see `LICENSE`.
