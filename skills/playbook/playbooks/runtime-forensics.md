# Runtime forensics

**You own the diagnosis. Instrument the live process; don't theorize from source.**
The deliverable is a cited diagnosis, not a fix.

1. Capture the live signal from the running process: a CPU profile for a spinning service (`/debug/pprof/profile`), a heap profile for a leak, a goroutine dump for a hang (`/debug/pprof/goroutine?debug=2`), `go tool trace` for latency spikes, a browser heap snapshot or Performance trace for a frontend glitch.
   Reproduce the load that triggers it against the local stack when production access is not available.
2. Reduce the artifact to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a root, the goroutines blocked on one lock or channel, the loop firing without input.
   Parse large artifacts in a `sonnet` subagent and keep only the reduced finding in the main thread.
3. Prove the mechanism before believing it.
   Add targeted logging or a debug endpoint, attach `dlv`, or evaluate in the browser console to confirm the hypothesis cheaply.
4. Map the finding to source: file, symbol, and the line that allocates, blocks, or schedules.

**Reply:** the signal captured, the reduced finding, how you proved the mechanism, the source location, artifact paths.
No fix unless asked; hand off to `bug-fix` or `perf-issue` once the cause is known.
