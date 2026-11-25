---
name: splash
description: "Find what a change could break somewhere else before it ships, beyond the diff, and prove the one fact it is safe because of by running real code instead of writing it up. Use for 'blast radius of X', 'what could this break', or reviewing a small diff you do not trust."
disable-model-invocation: true
---

# Splash - blast radius

Find what a change breaks somewhere else, before it ships.
Listing the callers is not the job; grep does that in a second.
The job is the breakage grep will not show you.

## Do not trust your own writeup

A splash writeup that sounds right is worthless, because it reads as convincing whether or not it is true.
Find the one or two facts the whole change depends on and prove them by running code.

For each fact the change's safety depends on, get it as far down this list as is cheap, and say where it stopped:

1. You said so. Worthless on its own.
2. You pointed at the line: a real `file:line`, or the library's own source.
3. You showed the bad case cannot happen, walking the failure step by step.
4. You ran it: a script or test that calls the real code and fails loud if you are wrong.
5. You reproduced it in the running app.

Step 4 is usually one small script or test that imports the same package the app ships and calls the exact function you are worried about.

## Steps

1. Read the change: the diff, the symbols it adds, changes and deletes, and what it now does differently, including the part the diff does not spell out.
   Read its commits and the ticket or spec it came from.
2. Find the one fact it is safe because of.
   Most changes that look risky are safe because of a single fact, like "this call only drops already-expired cache keys".
   If that fact holds, most risky cases clear at once, so spend your time here rather than on a long list of maybes.
3. Look where grep stops:
   - the source of the library you call, at its pinned version (`go.mod`, `package.json` lockfile) and any local `replace` or patch;
   - when things run: goroutines and context cancellation, deferred calls, transactions and their isolation, retries, Kafka consumer rebalances, React effects and unmount;
   - what a symbol search misses: JSON field names on the wire, a DB column or index, an ES mapping, a Redis key format, a Kafka message schema, a go-zero `.api` or OpenAPI contract, another service or the Flutter/web client reading the same bytes, a config key, a feature flag, cron jobs and consumers three hops downstream.
4. Be honest about each risk: give it a real chance of happening and a real cost if it does.
   Keep the risks you confirmed, and list the ones you checked and cleared separately.
   Cite a real `file:line`; a search that finds nothing is still an answer; never invent a caller or an API.
5. Prove the one fact: write a script or test that runs the real code, run it (targeted only, the test-guard hook blocks whole suites), and paste what happened.
   Use `~/shared-infra` when it needs a database or queue.
6. For a big or wide change, run it as an arena per `~/.claude/skills/grind/references/arena.md`, asking two or three models the same question and merging the answers.
   Different models catch different real bugs.

## Reply

- **What it does**: what changed, including the part that is not obvious.
- **The one fact it is safe because of**: state it, say which step of the list you got it to, and show the proof, or write "unproven".
- **Risks**: each names how it breaks, the `file:line`, how likely and how bad, and how to check; paste the proof for the ones that matter.
- **Cleared**: what you checked and why it is fine.
- **Before you merge**: the cheapest test or repro that catches the real bug, including the script you wrote.

Adapted from `splash` in Lauren Tan's pstack (MIT, see `LICENSE-pstack`).
