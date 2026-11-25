# Working on lockin

This file is for agents changing this repo, and is written so a human can follow it too.
`CLAUDE.md` is a symlink to this file.
For what lockin is and how to install it, read `README.md` first.

## The idea in plain terms

lockin is a set of instructions (skills), helper agents, safety hooks and small tools that make coding agents work the way the user does.
A human types `/lockin <task>`, and the `lockin` skill decides which step comes next: plan (`tactics`), spec, tickets, build (`grind`), prove, ship, learn (`replay`).
Agents may decide technical questions alone and log them; business questions (what users see, do or pay) always go to the user.
Gates are points where the agent stops and waits for the user: behaviour confirmed, spec reviewed, go to build, go to push.
Hooks stop the most expensive mistakes mechanically instead of trusting prose: whole-suite test runs, pushes to `main`, worktrees in the wrong place, branch switches in the user's checkout.

## How the pieces connect

- **Skills** (`skills/<name>/SKILL.md`) are Markdown instructions an agent loads by name, as `/name` or when its `description` matches the task.
  The frontmatter `name:` must equal the directory name.
- **Agents** (`agents/*.md`) are subagent roles the skills spawn with a short brief; each file carries the role's stable rules and its return shape.
- **Hooks** (`hooks/*.py`) are plain Python scripts shared by Claude Code, Cursor and pi.
  Each supports `--claude`, `--cursor`, `--check <command>` (pi) and `--selftest`.
- **pi extensions** (`pi/extensions/`) give pi what Claude Code has natively: subagents, sticky mode, guards, a questions UI.
- **`install.sh`** symlinks every skill into `~/.claude/skills`, `~/.pi/agent/skills` and `~/.cursor/skills`, agents into `~/.claude/agents` and `~/.cursor/agents`, hooks into `~/.agents/hooks`, and extensions into `~/.pi/agent/extensions`.
  It wires the hooks into `~/.claude/settings.json` and `~/.cursor/hooks.json`, and removes dangling links that point into this repo.
  Because everything is a symlink, an edit here is live in the next agent session; only adding, renaming or removing a file needs `./install.sh` again.
- Skills reference each other by the installed path, `~/.claude/skills/<name>/...`, never by this repo's path.

## Skill names

The names follow a "locked in" sports and gaming theme.
Older sessions, logs and project notes still use the names from before the rename (2026-11-25).

| Skill | Old name | One line |
| --- | --- | --- |
| `lockin` | `lockin-mode` | Sticky mode and router. |
| `warmup` | `lockin-prep` | One-time project setup. |
| `tactics` | `shape` | Settle the behaviour with the user before building. |
| `grind` | `drive` | Unattended multi-ticket orchestrator (`grind.sh` was `drive.sh`). |
| `playbook` | `playbook` | Step-by-step playbooks for single-owner work. |
| `replay` | `retro` | Fix the cause of repeated agent mistakes. |
| `lore` | `why` | Design rationale from the record. |
| `splash` | `blast-radius` | What a change breaks beyond its diff. |
| `spar` | `interrogate` | Cross-model adversarial review (`grind/references/spar.md` was `interrogate.md`). |
| `scout` | `create-verification-skill` | Generate a project `verify-<app>` skill and feature map. |
| `rescout` | `maintain-verification-skill` | Keep that verify skill honest, scoped and weekly. |
| `ref` | `structural-tests` | Turn prose rules into tests and lint rules. |

## Names that must not change

These are data formats on disk or in other tools, not skill names.
Renaming them silently orphans existing data, so they kept their old names on purpose.

| Name | Where | Why it stays |
| --- | --- | --- |
| `LOCKIN_ENTRY = "lockin-mode"` | `pi/extensions/lockin/core.mjs` | Session entry type stored in pi sessions; resumed sessions look it up. |
| `~/.agents/lockin/retro/` | `replay` log and backups | Holds the existing change log and the backups used to revert. |
| `~/.agents/lockin/maintain/` | `rescout/scripts/weekly.sh` logs | Existing weekly run logs. |
| `lockin.rescout.<project>` | launchd label | Installed plists in `~/Library/LaunchAgents`. |
| `maintain-<date>.md` | rescout notes in each project's `.scratch/verify-<app>/` | `check-project-docs.mjs` dates the last full pass from these files. |
| `<project>/.worktrees/<repo>/maintain-weekly` | weekly worktrees | Reused between runs. |
| `hooks/lockin_mode.py` | hook file | Referenced from `~/.claude/settings.json`. |

`skills/replay/UPSTREAM.md` and every `LICENSE-*` file are verbatim upstream copies; never edit them.

## Renaming or removing a skill

1. Move the directory and set `name:` in its frontmatter.
2. Update every reference in this repo: `~/.claude/skills/<name>/` paths, `/name` commands, backticked names, and prose that names the skill.
   Plain English words are not references: "drive the app", "the shape of the data" and "why" stay as they are.
3. Run `./install.sh`; it links the new name and removes the dangling old link in all three tools.
4. Update references outside the repo: `~/AGENTS.md` (also `~/.claude/CLAUDE.md` and `~/.pi/agent/AGENTS.md`, which link to it), launchd plists that call a script, and project docs that cite a skill path (`grep -r "skills/<old>/" <projects dir> --include=*.md`).
5. Add the old name to the table above.

## Writing rules

- One full sentence per physical line in Markdown; `.markdownlint-cli2.jsonc` turns off the line-length rule for that reason.
- Never use the em dash; use a plain dash.
- A skill's `description` says what it does and when to use it, because agents pick skills by description.
- Put a rule where a machine can enforce it (hook, test, lint) before writing it as prose.
- Keep `README.md` and the tables in this file in sync when a skill, agent or hook is added, renamed or removed.

## Checks after a change

Run the ones that cover what you touched.

```sh
python3 hooks/<hook>.py --selftest                       # each hook you changed
(cd pi/extensions/lockin && node --test)                 # pi extension
for f in install.sh skills/*/*.sh skills/*/scripts/*.sh; do bash -n "$f"; done   # shell syntax
node skills/scout/scripts/check-feature-map.mjs skills/scout/references/feature-map-example
./install.sh --check                                     # nothing MISSING or STALE
grep -rn "skills/<old-name>/" . ~/AGENTS.md             # after a rename: no hits
```

## Committing

The maintainer reviews and commits this repo.
Leave changes uncommitted, and list what changed and what you did not check.
