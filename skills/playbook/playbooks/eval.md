# Eval

**You own the experiment design. Plan, blind, run, synthesize.**

Blinding rules:

- No `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `arena` in any directory, file, or prompt a candidate sees.
- The candidate prompt reads like an organic user request that states the goal, not the meta.
- No chain-eliciting cues: ask for design notes in general and grade chain-following from what the candidate did, never from its self-report.
- Directory and slug names look like something a user would pick.
- Candidates never learn other candidates exist.
- The judge knows it is judging but sees outputs only by sanitized label, never by model name.
- When comparing two variants, one judge scores both sets in one pass on one scale.

Steps:

1. Frame: state the variant under test and what behaviour counts as success.
   Write a 3-6 criterion rubric for the judge only.
2. Set up one sanitized working dir per candidate with the variant in place, plus the context an organic task would have (project skeleton, skills it would naturally read).
3. Write one organic prompt, the same for every candidate.
4. Launch N candidates in parallel on different models (Claude Code `opus`, `fable`, `sonnet`; pi with a non-Claude model when configured), each in its own dir.
   An agent that only dispatches or polls runs on `sonnet` or `haiku`.
5. Launch one blinded `judge` subagent on a model family no candidate used where possible, passing `model` explicitly, with the rubric path and the sanitized output paths.
6. Verify the chain from transcripts, not self-report: Claude Code `~/.claude/projects/<cwd-slug>/*.jsonl`, pi via `session_search` or `~/.pi/agent/sessions/`.
   Read only this workspace's transcripts.
   Grade from the files each candidate actually opened and the shape of its output.
7. Read every candidate output yourself end to end and compare with the judge.
   Disagreement means a biased model or an ambiguous rubric; resolve which.

**Reply:** variant under test, rubric, per-candidate notes, the judge's verdict, your synthesis, and whether to promote the variant.
