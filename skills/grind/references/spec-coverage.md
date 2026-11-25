# Spec-coverage reconciliation

The final gate, run once after every ticket is `done` and the full suite + code-review pass. It catches the failure the per-ticket checks structurally cannot: a requirement that was dropped between spec and tickets, or never ticketed at all. Per-ticket verification only ever checks a ticket against its own acceptance criteria - nothing checks the spec against the sum of the tickets.

## How

Dispatch a fresh `subagent_type: spec-auditor` (it must not be an implementer that already "knows" what it built). The agent definition carries the task and the return table; give it only pointers:

- the spec path, and the source PRD / mocks / ADRs the spec references;
- the list of ticket files and their `done` commits;
- the integration branch name, and in a multi-repo project every touched repo path.

It returns a table of requirement -> satisfied-by (ticket + `file:line`) | **NOT FOUND**, adversarial about NOT FOUND, plus every gap.

## Then

- Any `NOT FOUND` becomes a new ticket (or a fix in a final implementer wave).
- Re-run this reconciliation after the fixes if the gaps were substantial.
- Only report the feature complete when the table is all-satisfied.

This is the one step that would have caught the "UI reported missing after a long run" and the silently-dropped backend-config requirements from the past runs.
