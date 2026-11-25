# Trace forensics

**You own the diagnosis from the artifact.**
The capture already exists, so read it as a fixed dataset instead of re-running anything; a live process belongs to `runtime-forensics`.

1. Identify the format and load it with the right tool: `go tool pprof` for profiles, `go tool trace` for execution traces, Chrome DevTools or a JSON parser for browser traces and heap snapshots, a text editor for goroutine dumps and slow logs.
   Parse large artifacts in a `sonnet` subagent and keep the reduced finding in the main thread.
2. Transform the raw artifact into a queryable shape before reading it, for example sqlite with one row per sample, frame, node, or log line.
3. Narrow to the cause.
   Query for the frames holding the most time and walk the call tree to the hot path.
   For a leak, follow the retainer chain to a root.
   For a hang, find the goroutines blocked and what they wait on.
4. Attribute to source: map the hot frame to file, symbol, and line through the artifact's own symbols.
   A frame with no source mapping is not yet a diagnosis; resolve the symbols or say the artifact lacks them.
5. With a paired capture, diff before and after to confirm.
   Without one, label the finding as the strongest hypothesis the artifact supports.

**Reply:** the artifact and format, the reduced finding, the source location, artifact paths, and whether a paired capture confirmed it.
No fix unless asked; hand off to `bug-fix` or `perf-issue` once the cause is known.
