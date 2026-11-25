#!/usr/bin/env python3
"""Block full-suite test runs in the inner loop. Shared by Claude Code, Cursor and pi.

Full suites (`go test ./...`, `make test|e2e`, bare Playwright / `pnpm e2e`) run once,
in the final gate, prefixed with FULL=1. Everything else must be targeted.

Modes (stdin = the tool's hook JSON):
  --claude   PreToolUse:  {"tool_input": {"command": ...}} -> exit 2 + stderr to block
  --cursor   beforeShellExecution: {"command": ...} -> stdout {"permission": ...}
  --check    plain command string as argv[2]; exit 2 + stderr reason to block (pi)
  --selftest run the asserts below
"""
import json
import os
import re
import sys
import time

LOG = os.path.expanduser("~/.agents/hooks/test-guard.log")

TARGETED_HINT = (
    "Run only the tests covering what you changed: "
    "`go test ./internal/<pkg>/...` (or `-run '^TestX$'`), "
    "`playwright test e2e/<file>.spec.ts` / `--only-changed` / `-g '<name>'`. "
    "Full suite runs ONCE in the final gate, after every ticket is done, as `FULL=1 <cmd>`."
)

# ponytail: quoted strings are dropped before matching, so `pgrep -f "playwright test"` passes,
# but so does `bash -c "go test ./..."`. Agents don't wrap tests that way; parse argv if they start.
QUOTED = re.compile(r"'[^']*'|\"(?:[^\"\\]|\\.)*\"")
RULES = [
    (re.compile(r"\bgo\s+test\b[^;&|]*(?:^|\s)\./\.\.\.(?=\s|$|[;&|)])"), "go test ./... (whole module)"),
    (re.compile(r"\bmake\s+(?:[^;&|]*\s)?(?:test|e2e|test-all|test-e2e)(?=\s|$|[;&|)])"), "make test/e2e (whole suite)"),
]
PW = re.compile(r"\bplaywright\s+test\b([^;&|]*)")
PKG_E2E = re.compile(r"\b(?:pnpm|npm|yarn|bun)\s+(?:-\S+\s+)*(?:run\s+)?(?:e2e|test:e2e)\b([^;&|]*)")
TARGETING = re.compile(r"(?:\.spec\.|\.test\.|\be2e/\S|\s-g\s|--grep|--only-changed|--last-failed|:\d+)")
FULL = re.compile(r"(?:^|[\s;&|(])FULL=1\b")
CD = re.compile(r"(?:^|[;&|(]\s*)cd\s+([^\s;&|)]+)")
GO_ALL = RULES[0][0]
FULL_GO_NOTE = (
    "FULL=1 go test ./... in a repo whose Makefile has a `test` target: run `FULL=1 make test` instead. "
    "It carries the suite's own flags (timeout, GOWORK); bare `go test ./...` dies at the 10 min default timeout "
    "and leaves the harness half-cleaned (retro 2026-11-20)."
)


def verdict(cmd: str):
    """Return a block reason, or None to allow."""
    if FULL.search(cmd):
        bare = QUOTED.sub("''", cmd)
        if GO_ALL.search(bare) and "-timeout" not in bare and _makefile_has_test(_target_dir(bare)):
            return "FULL_GO"
        _log("FULL", cmd)
        return None
    cmd = QUOTED.sub("''", cmd)
    for rx, what in RULES:
        if rx.search(cmd):
            return what
    for rx, what in ((PW, "playwright test (whole suite)"), (PKG_E2E, "e2e script (whole suite)")):
        for m in rx.finditer(cmd):
            if not TARGETING.search(m.group(1) + " "):
                return what
    return None


def _target_dir(cmd):
    """The directory the command runs in: cwd, moved by every `cd <dir>` before the test."""
    d = os.getcwd()
    for m in CD.finditer(cmd):
        d = os.path.normpath(os.path.join(d, os.path.expanduser(m.group(1))))
    return d


def _makefile_has_test(d):
    """True when the nearest Makefile up to the repo root defines a `test:` target."""
    while True:
        mk = os.path.join(d, "Makefile")
        if os.path.isfile(mk):
            try:
                return re.search(r"(?m)^test\s*:", open(mk).read()) is not None
            except OSError:
                return False
        if os.path.exists(os.path.join(d, ".git")) or os.path.dirname(d) == d:
            return False
        d = os.path.dirname(d)


def _log(kind, cmd):
    try:
        with open(LOG, "a") as f:
            f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')}\t{kind}\t{os.getcwd()}\t{cmd[:300]!r}\n")
    except OSError:
        pass


def message(what):
    if what == "FULL_GO":
        return f"test-guard: blocked. {FULL_GO_NOTE}"
    return f"test-guard: blocked {what}. {TARGETED_HINT}"


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    if mode == "--selftest":
        return selftest()
    if mode == "--check":
        cmd = sys.argv[2] if len(sys.argv) > 2 else sys.stdin.read()
    else:
        try:
            data = json.load(sys.stdin)
        except Exception:
            return 0  # fail open on malformed input: never break the agent's shell
        cmd = (data.get("tool_input") or {}).get("command", "") if mode == "--claude" else data.get("command", "")
    what = verdict(cmd or "")
    if what:
        _log("BLOCK", cmd)
    if mode == "--cursor":
        out = {"permission": "deny", "agent_message": message(what), "user_message": f"test-guard: {what}"} if what else {"permission": "allow"}
        print(json.dumps(out))
        return 0
    if what:
        sys.stderr.write(message(what) + "\n")
        return 2
    return 0


def selftest():
    global LOG
    LOG = os.devnull
    block = [
        "go test ./...",
        "cd srv && GOWORK=off go test -count=1 ./... 2>&1 | tail",
        "go test -race ./... -run X",
        "make test",
        "make -C srv e2e",
        "pnpm -s e2e --workers=2",
        "npm run e2e",
        "pnpm exec playwright test",
        "npx playwright test --reporter=line",
    ]
    allow = [
        "go test ./internal/middleware/ -run '^TestTraceHeader$'",
        "go test ./internal/usage/...",
        "go build ./... && go vet ./...",
        "FULL=1 go test ./...",
        "FULL=1 pnpm e2e",
        "pnpm exec playwright test e2e/access.spec.ts -g 'side menu'",
        "pnpm e2e e2e/usage.spec.ts",
        "playwright test --only-changed",
        "playwright test -g 'login'",
        "make build",
        "make gen-api",
        "vitest run",
        "pnpm test",
        "git commit -m 'make tests faster'",
        "until ! pgrep -f \"playwright test\" >/dev/null; do sleep 5; done",
        "grep -n 'go test ./...' Makefile",
    ]
    for c in block:
        assert verdict(c), f"should block: {c}"
    for c in allow:
        assert not verdict(c), f"should allow: {c} (got {verdict(c)})"
    import tempfile
    with tempfile.TemporaryDirectory() as repo, tempfile.TemporaryDirectory() as bare_repo:
        os.mkdir(os.path.join(repo, ".git"))
        os.mkdir(os.path.join(bare_repo, ".git"))
        os.makedirs(os.path.join(repo, "internal", "x"))
        with open(os.path.join(repo, "Makefile"), "w") as f:
            f.write("build:\n\tgo build ./...\n\ntest:\n\tGOWORK=off go test -timeout 30m ./...\n")
        # The command that died at 10 min in the ui-fixes run, then left a 2.6 GB benchmark DB behind.
        past = f"cd {repo} && (FULL=1 GOWORK=off nohup go test ./... -count=1 > /tmp/x.log 2>&1; echo done)"
        assert verdict(past) == "FULL_GO", f"should block bare full go test: {verdict(past)}"
        assert verdict(f"cd {repo}/internal/x && FULL=1 go test ./...") == "FULL_GO"
        for ok in (f"cd {repo} && FULL=1 make test", f"cd {repo} && FULL=1 go test -timeout 30m ./...",
                   f"cd {bare_repo} && FULL=1 go test ./..."):
            assert not verdict(ok), f"should allow: {ok} (got {verdict(ok)})"
    print(f"selftest ok: {len(block)} blocked, {len(allow)} allowed, FULL go test rule ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
