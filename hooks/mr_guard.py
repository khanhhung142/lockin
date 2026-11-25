#!/usr/bin/env python3
"""Block MRs into main/master and direct pushes to main/master. Shared by Claude Code, Cursor and pi.

The user's rule: an MR is opened only when a whole feature is done, and never into main/master.
Its base is the repo's integration branch (dev / stage / stable ...).

Modes (stdin = the tool's hook JSON), same contract as test_guard.py:
  --claude   PreToolUse:  {"tool_input": {"command": ...}} -> exit 2 + stderr to block
  --cursor   beforeShellExecution: {"command": ...} -> stdout {"permission": ...}
  --check    plain command string as argv[2]; exit 2 + stderr reason to block (pi)
  --selftest run the asserts below
"""
import json
import re
import sys

PROTECTED = r"(?:main|master)"
# ponytail: regex over the command string, not a git argv parser; a push hidden in a script file passes.
PUSH = re.compile(r"\bgit\s+(?:-\S+\s+(?:\S+\s+)?)*push\b([^;&|]*)")
MR_TARGET = re.compile(r"merge_request\.target=['\"]?" + PROTECTED + r"(?=['\"\s]|$)")
# refspec `main`, `HEAD:main`, `x:refs/heads/main`, `+main` as a standalone push argument
REFSPEC = re.compile(r"(?:^|\s)\+?(?:[^\s:]*:)?(?:refs/heads/)?" + PROTECTED + r"(?=\s|$)")

HINT = (
    "Open an MR only when the whole feature is done, targeting the repo's integration branch "
    "(dev / stage / stable), never main/master. See the opening-an-mr playbook."
)


def verdict(cmd: str):
    for m in PUSH.finditer(cmd):
        args = m.group(1)
        if MR_TARGET.search(args):
            return "MR targeting main/master"
        if REFSPEC.search(args):
            return "push to main/master"
    return None


def message(what):
    return f"mr-guard: blocked {what}. {HINT}"


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
    if mode == "--cursor":
        out = {"permission": "deny", "agent_message": message(what), "user_message": f"mr-guard: {what}"} if what else {"permission": "allow"}
        print(json.dumps(out))
        return 0
    if what:
        sys.stderr.write(message(what) + "\n")
        return 2
    return 0


def selftest():
    block = [
        "git push -o merge_request.create -o merge_request.target=main -u origin feat/x",
        "git push -o merge_request.create -o merge_request.target=master origin feat/x",
        "git push -o 'merge_request.target=main' origin feat/x",
        "git push origin main",
        "git push origin HEAD:main",
        "git push -f origin feat/x:refs/heads/master",
        "cd srv && git push origin +main",
        "git -C api-server push origin main",
    ]
    allow = [
        "git push -o merge_request.create -o merge_request.target=dev -u origin feat/x",
        "git push -o merge_request.target=stable origin feat/main-menu",
        "git push -u origin feat/x",
        "git push origin dev",
        "git pull origin main",
        "git fetch origin main",
        "git rebase origin/main",
        "git log main..HEAD",
        "git checkout main",
        "grep -n 'merge_request.target=main' notes.md",
    ]
    for c in block:
        assert verdict(c), f"should block: {c}"
    for c in allow:
        assert not verdict(c), f"should allow: {c} (got {verdict(c)})"
    print(f"selftest ok: {len(block)} blocked, {len(allow)} allowed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
