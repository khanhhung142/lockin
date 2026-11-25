---
name: spar
description: "Adversaries on different models try to break a change or a design; a finding survives only when a rerun command proves it. Reports findings, does not fix. Use for 'interrogate this', 'try to break this', a contested design, or a diff you want proven before merge outside a /grind run."
disable-model-invocation: true
---

# Spar

The procedure lives in one place, `~/.claude/skills/grind/references/spar.md`, so grind's final gate and this standalone skill never drift apart.
Read it and run it with these differences:

- **Scope**: what the user names.
  Otherwise the current branch diff from its merge base with the base branch, including uncommitted changes in the working tree (tell each `adversary` so it copies them into its worktree).
- **Intent**: restate it from the user's message, the commits, and the ticket or spec when one exists.
  Ask the user when the intent is unclear, before fanning out.
- **Output location**: `.scratch/spar-<short-sha>/` in the workspace instead of a feature folder.
- **Design or plan instead of code**: the design doc is the scope pointer; adversaries break it with a prototype or by probing the current tree, and the same rule holds that a finding needs a command and its output.
- **After the report**: stop.
  Verified findings go back to the user; nothing becomes a fix ticket unless they ask.

Adapted from `spar` in Lauren Tan's pstack (MIT, see `../splash/LICENSE-pstack`).
