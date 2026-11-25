# Refactoring

**You own the contract. The structure changes; the behaviour does not.**
A missing feature or real bug found along the way gets split out; ship the structural change first against the pinned contract.
A redesign is allowed, but name it and route it to `feature`.
Large or cross-cutting structural work belongs to `figure-it-out`.

1. Pin the behaviour contract before anything moves.
   Trace the subsystem, then write a characterization test, snapshot, or equivalence harness that captures current behaviour.
   Type check and lint are not a pin.
2. Name the structure the code is missing (state machine, typed model, table, boundary).
   Boring code stays when its shape is already clear and local.
   The reshape must delete branches or invalid states, not add indirection.
3. Name the target shape: the module layout, types, and call graph you would build today.
   Run `splash` on every symbol you will move or rename.
4. Subtract before you add: delete dead code, collapse one-caller wrappers, drop redundant validation, remove orphan references.
   The smallest change that reaches the target shape ships.
5. Move in small behaviour-preserving steps, each keeping the pin green.
   For an API reshape, migrate every caller and delete the old API in the same wave, with no shims or parallel paths.
   Spot-check every rename against the files, since renames miss usages in strings, config, SQL, and docs.
   Delegate to `implementer` subagents, passing `model`: `sonnet` for mechanical edits, `opus` for judgement-heavy moves, each with file paths, the names moving, and the behaviour to hold.
6. Prove behaviour is unchanged on the real artifact: rerun the pin, and for larger reshapes diff old versus new outputs or replay a recorded baseline against the local stack.
7. Keep the change only if it lowers reader load somewhere (fewer layers, less hidden state, smaller mutable scope); otherwise revert it.
8. Rebase into ordered commits: subtraction, then reshape, then follow-on cleanup.
   Run `opening-an-mr`.

**Reply:** the structure that changed, the pin, the equivalence proof, the reader-load delta, what shipped and what got reverted.
