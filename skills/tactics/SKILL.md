---
name: tactics
description: "Shape a plan, feature or decision with the user before anything is built: short numbered rounds of questions, each with a recommended answer, until the core behaviour is confirmed, recording new terms and decisions in the glossary and ADRs. Use in the lockin Tactics phase, for /tactics, or when a task's behaviour, scope or business rules are still open."
---

# Tactics

Ask the user questions until you both agree on what to build.
Track the open decisions as a tree: each decision unlocks the ones that depend on it.

Work in rounds.
Each round, ask every question you can ask now without guessing an answer you have not heard yet, then wait.
A question that depends on another question in the same round waits for the next round.

Keep a round short and plain:

```text
1. <question in one sentence>?
-> <recommended answer>
2. <question>: A / B / C?
-> B, <reason in a few words>

Reply "ok" to take every recommendation, or name the numbers to change.
```

- Each question is one numbered line, with the recommendation on the next line after `->`.
- Add one sentence of context only when the question cannot be understood without it.
- No emoji, headings, separators or bold titles per question.
- List options inline only when the choice is between named options.

Each answer can open or close other decisions; recompute what is askable and ask the next round.

Facts are your job, decisions are the user's.
When a question needs a fact from the code, files or tools, send a subagent to find it instead of asking.
Only the questions that depend on that fact wait for it; ask the rest of the round now.

When a new term, a shifted meaning or a hard-to-reverse decision comes up, record it with the `domain-modeling` skill (glossary, ADR) in the same round.

You are done when no decision is left open and nothing is silently assumed.
Do not build anything until the user confirms the shared understanding.

Adapted from `grilling` in Matt Pocock's skills (<https://github.com/mattpocock/skills>, MIT).
