# Investigation

**You own the answer.**
Investigation is read-only: it produces a cited explanation or a recommendation, not a code change.

1. Trace the code the question is about and cite `file:line` for every claim.
   A question spanning several subsystems fans out one `source-reader` subagent per subsystem, with the question and the repo roots as pointers; spot-check their citations.
   For "why is it like this" questions, also run the `lore` skill for history.
   For questions that need outside docs or APIs, run the `research` skill.
2. Write the output under Overview, Key concepts, How it works, Where things live, Gotchas.
   For a decision between alternatives, write a recommendation with a tradeoffs table instead.
3. If the investigation precedes a code change, stop and re-route to `bug-fix` or `feature` (log that playbook).

**Reply:** the investigation output.
For "are we sure?" questions, give your real judgment with reasons, and push back when the premise is wrong.
