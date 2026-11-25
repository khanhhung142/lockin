# Bug fix

**You own this task. Plan, review, verify.**
Delegate a large hunt or fix to subagents and stay in the lead.

Every shipped line traces to runtime evidence.
A change that "might help" is a hypothesis, not a fix, and it does not ship.
When evidence refutes a hypothesis, revert what it motivated.

1. Reproduce it yourself end to end, on the path a real user takes: the UI through Playwright, the API through the gateway with real auth, a consumer through a real message on the shared Kafka.
   Use the project's verify skill when one exists.
   If it will not fire, synthesize the trigger, tighten conditions, or add instrumentation until it does.
   Ask the user only with a specific reason the surface is unreachable, after driving it as far as it goes.
   Save the repro as a command or script you can rerun.
2. Binary-search the cause with the `diagnosing-bugs` skill.
   Seed hypotheses with a trace of the subsystem and the `lore` skill for regression history.
   Each pass, take the split that cuts the most remaining space, get runtime evidence, eliminate.
   When state is unclear, add logging and read it as the code runs.
   If two fixes that share a premise have failed, write the premise down and test it directly.
   Confirm the surviving mechanism with runtime evidence before step 3.
3. Plan the smallest fix the evidence justifies, at the first place the system went wrong.
   If it crosses a function or service boundary, name the data shape and the owner of each piece of state, and run `splash` on the touched symbols.
   Delegate the implementation to an `implementer` subagent (`opus`) with the file paths, the mechanism, and the repro command.
4. Write the failing test first with the `tdd` skill when a cheap local path exists.
   Skip it when the test would be integration-heavy or unclear, and say why.
5. Verify on the same surface as step 1.
   The original repro now passes; unit tests show branch behaviour, not bug absence.
6. Order commits so the failing test lands before the fix.
   Run `opening-an-mr`.

**Reply:** what was broken, the root cause, the fix, how you verified, with the failing-then-passing repro output verbatim.
