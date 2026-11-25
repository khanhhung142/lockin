# Perf gate (per ticket, baseline first)

A ticket gets a perf gate only when it can move a number someone cares about.
Most tickets do not, and the global p95 run in the final gate still covers the whole system.

## When a ticket gets the perf gate

The orchestrator marks the ticket `Perf: required` in the wave checkpoint (see SKILL.md step 3) when any of these hold:

- The spec or the ticket names a budget (latency, p95, throughput, memory, bundle size, query count).
- The ticket touches a hot path: a request handler on the gateway/proxy path, a per-message or per-row loop, a DB query on a list endpoint, a render loop for a long list.
- The ticket swaps an algorithm, a data structure, an index, or a caching layer.

Otherwise the ticket is `Perf: n/a - <reason>`, and the implementer skips this file.

## The four boxes

The implementer fills all four in the ticket file under a `## Perf` heading before reporting `done`.

1. **Metric**: one number, with its unit and direction, for example `p95 latency of POST /v1/chat, ms, lower is better`.
2. **Probe**: the exact command that produces the number, targeted at the code the ticket touches.
   Go: `go test -run '^$' -bench <BenchName> -benchmem -count 6 ./internal/<pkg>/`.
   HTTP: the repo's own load script against the local stack, or a `hey`/`k6` one-liner with fixed concurrency and duration.
   Frontend: a Playwright trace or a `performance.mark` probe on the touched screen.
   Never a whole-suite run; the `test-guard` hook still applies.
3. **Baseline**: the same probe run on the integration branch tip **before** the change, recorded with its raw output.
   Measure it first, in your worktree, before writing code.
   A number with no baseline is not evidence.
4. **Fail line**: the number that fails the gate, written down before the treatment run.
   Default: the spec budget when one exists, otherwise worse than baseline by more than 10% (or by more than the run-to-run noise you saw across `-count 6`, whichever is larger).

## Outcome

- Treatment beats or holds the fail line: record treatment output next to the baseline, gate passes.
- Treatment crosses the fail line and you can fix it without changing behaviour: fix it, re-measure, record both runs.
- Treatment crosses the fail line and fixing it would change behaviour or scope: return `blocked`.
  Accepting a budget miss is a business question for the user, never a default.

## Why

pstack's multi-phase plan treats a PR as verified only when its unit, live and perf boxes are all checked, with the trunk baseline measured first.
Grind used to push all perf checks to the final gate, so a regression introduced in wave 1 surfaced only after every later ticket built on top of it, and the culprit was hard to find.
A per-ticket probe that is scoped to one package keeps verify-once cheap and catches the regression at the ticket that caused it.
