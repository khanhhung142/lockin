# Feature

**You own the design. Plan, review, verify.**
Delegate implementation and stay in the lead.

A feature with more than one ticket goes through `/to-spec`, `/to-tickets`, then `/grind`.
This playbook covers a feature one owner can build, and the design steps (trace, shape, prototype) before a spec.

1. Trace the affected subsystem across services: entry point, data flow, storage, consumers.
2. Name the data shape and its organizing structure before any logic: a state machine over scattered booleans, a table or registry over branching, a typed model over repeated shape assumptions.
   Name which service owns each piece of state.
   A shape that is expensive to change later (DB or ent schema, `.api` or `.proto` contract, public API, error model) runs arena per `~/.claude/skills/grind/references/arena.md`.
   Contested product behaviour goes to the user, ideally through the `huddle` skill.
3. Write the throughput checkpoint as four todo items; an item that does not apply keeps its line as `n/a: <reason>`:

   - **Blocking first steps**: what must land before fan-out (migration, shared type, generated code).
   - **Independent workstreams**: disjoint files, services, or layers run in parallel; shared writes serialize.
   - **Shared mutable state**: default to splitting the target (one file per unit); serialize only for a real invariant.
   - **Smallest safe decomposition**: if one worker is best, say why.
4. Delegate code-writing to an `implementer` subagent (`opus`, own worktree by definition), with file paths, the named data shape, and success criteria.
   Regenerate code with the project's generators (`goctl`, `ent generate`, `gf gen`) instead of hand-editing generated files.
   Build test-first with the `tdd` skill.
   Port improvements to a shared primitive to all its consumers and verify each.
5. Verify on the real surface.
   For UI, drive it with Playwright, screenshot each state, and fix anything that looks off.
6. Rebase into small ordered commits, each building, verified, and green before the next.
7. If the design is contested, run the `spar` skill before shipping.
8. Run `opening-an-mr`.

**Reply:** what you built, what you chose and why (tables for design alternatives), the throughput checkpoint, open decisions.
