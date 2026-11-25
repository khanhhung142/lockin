# Authoring a skill

**You own the skill's voice.**

1. Read the `writing-for-agents` skill, including `SKILL-MECHANICS.md`, before writing.
   Decide model-invoked versus user-invoked first, since it decides whether the description carries triggers.
2. Write or edit the skill.
   Keep only prose that changes a decision, tell the agent to do the thing, and explain only when a rule is confusing without its reason.
   Point at structural sources (types, config, scripts, other skills by name) instead of restating them.
   A rule an agent keeps breaking belongs in a script, hook, or lint, not another sentence.
3. Validate: frontmatter has `name` and `description`, every referenced file exists, every named skill resolves, scripts run, and the markdown has no lint warnings.
4. If the skill should reach pi and Cursor, symlink it into `~/.pi/agent/skills/` and `~/.cursor/skills/`.
5. For structural skills, test with a real task in a fresh agent and read what it actually did; skip for subjective ones.
6. If the skill lives in a git repo, run `opening-an-mr`; otherwise report the paths.

**Reply:** what the skill does, key design decisions, validation notes.
