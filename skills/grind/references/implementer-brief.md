# Implementer brief

The per-ticket brief each implementer subagent gets, and why its rules exist.

## Brief template

Spawn `subagent_type: implementer` (model `opus` unless arena picks another).
The agent file (`~/.claude/agents/implementer.md`, from the lockin pack) carries every stable rule: worktree isolation, `tdd`, verify-once with targeted tests, the `test-guard` hook, shared infra, the UI and perf gates, business-vs-technical questions, DECISIONS.md, FLAKY.md, the commit, and the return shape.
The brief carries only what changes per ticket:

> Ticket `<NN>`: `<ticket path>`. Spec: `<spec path>`.
> Repo: `<project>/<repo>` (worktree at `<project>/.worktrees/<repo>/<NN>-<slug>`). Integration branch: `<branch>`. Feature dir: `.scratch/<feature>/`.
> `<Perf: required | Perf: n/a - reason>`. UI: `<yes | no>`.
> Optional, only when they apply: `This is an arena run.` / `Graft in worktree <path>: port <item> from <candidate>, because <why>.` / `Fix ticket: turn <repro command> green.`

Never paste the spec, other tickets, or the agent's rules into the brief.

## Why these rules (do not relax them)

- **Verify-once** is the single biggest time saver: the 30h run re-ran the same `go vet`/`go test` 3-4x per ticket (implementer, reviewer, smoke, parent). One trusted run per ticket + one full suite at the very end.
- **Worktree isolation** was designed but skipped in the slow run; all subagents wrote to one detached `HEAD` and stomped shared files, spawning repeated "align mock" rework. Isolation is not optional when the wave has more than one implementer.
- **Share the runtime**: parallel implementers each rebuilding the services their ticket never touches waste build time and disk, so unchanged services run once per commit and are reused by name.
  One-of-a-kind resources are held per command: in one mobile app run, two implementers waited over an hour on an emulator lease that a third held across its edit cycles.
- **Targeted tests only**: a 10h run spent most of its 7.7h of subagent time re-running the full Go suite and the full Playwright suite after every small edit (~445 full-suite runs across one project's history). The hook now blocks it; this note is why.
- **Business blocks, technical doesn't**: the slow runs defaulted on a business concept (a model-gateway that was actually an OpenRouter-style proxy) and the error surfaced hours later; another run idled 16h on a question nobody was there to answer. Business guesses are expensive; technical guesses are cheap and reversible from DECISIONS.md.
