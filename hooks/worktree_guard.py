#!/usr/bin/env python3
"""Block `git -C <repo> worktree add <relative path>`. Shared by Claude Code, Cursor and pi.

With `-C <repo>`, git resolves a relative worktree path against <repo>, not the shell's cwd,
so `git -C api-server worktree add .worktrees/api-server/x` lands inside the repo
(api-server/.worktrees/api-server/x). Project worktrees belong at <project>/.worktrees/<repo>/<name>.

Modes (stdin = the tool's hook JSON), same contract as test_guard.py and mr_guard.py:
  --claude   PreToolUse:  {"tool_input": {"command": ...}} -> exit 2 + stderr to block
  --cursor   beforeShellExecution: {"command": ...} -> stdout {"permission": ...}
  --check    plain command string as argv[2]; exit 2 + stderr reason to block (pi)
  --selftest run the asserts below
"""
import json
import re
import shlex
import sys

# worktree add options that take a value; every other option is a flag.
VALUE_OPTS = {"-b", "-B", "--reason"}


def verdict(cmd: str):
    # shortcut: splits on ; & | and newlines without honouring quotes; a separator inside a quoted arg may misparse.
    for seg in re.split(r"[;&|\n]+", cmd):
        try:
            toks = shlex.split(seg)
        except ValueError:
            continue
        for i, t in enumerate(toks):
            if t != "git":
                continue
            j, repo = i + 1, None
            while j < len(toks) and toks[j].startswith("-"):  # git's own options
                if toks[j] == "-C" and j + 1 < len(toks):
                    repo = toks[j + 1]; j += 2; continue
                j += 2 if toks[j] in ("-c", "--git-dir", "--work-tree") else 1
            if toks[j:j + 2] != ["worktree", "add"] or repo in (None, "."):
                continue
            k = j + 2
            while k < len(toks) and toks[k].startswith("-"):
                k += 2 if toks[k] in VALUE_OPTS else 1
            if k >= len(toks):
                continue
            path = toks[k]
            if path.startswith(("/", "~", "$", "..")):
                continue
            return repo, path
    return None


def message(hit):
    repo, path = hit
    return (f"worktree-guard: `git -C {repo} worktree add {path}` resolves {path} against {repo}, "
            f"so the worktree would land inside the repo ({repo.rstrip('/')}/{path}). "
            f"Pass an absolute path, e.g. \"$PWD/{path}\" from the project folder (worktrees go at <project>/.worktrees/<repo>/<name>).")


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
    hit = verdict(cmd or "")
    if mode == "--cursor":
        out = {"permission": "deny", "agent_message": message(hit), "user_message": "worktree-guard: relative path under git -C"} if hit else {"permission": "allow"}
        print(json.dumps(out))
        return 0
    if hit:
        sys.stderr.write(message(hit) + "\n")
        return 2
    return 0


def selftest():
    block = [
        # the two real mistakes (two grind runs, 2026-11-19 and 2026-11-23)
        "cd /home/me/work/shop; git -C api-server worktree add -q -b feature/ui-fixes .worktrees/api-server/ui-fixes version/v1.1 && git -C web-frontend worktree add -q -b feature/ui-fixes .worktrees/web-frontend/ui-fixes dev",
        "cd /home/me/work/shop; for r in api-server web-frontend; do git -C $r worktree add -q --detach .worktrees/$r/final-gate feature/price-sheet 2>&1 | tail -1; done",
        "git -C repo worktree add wt/x",
        "git -C repo worktree add --reason 'why' -B tmp .worktrees/x origin/dev",
    ]
    allow = [
        "git -C api-server worktree add ../.worktrees/api-server/lockin-prep -b chore/lockin-prep dev",
        "git -C $r worktree add -q --detach $PWD/.worktrees/$r/final-gate feature/price-sheet",
        'git -C api-server worktree add -q -b chore/x "$PWD/.worktrees/api-server/x" version/v1.2',
        "git -C /abs/repo worktree add /abs/project/.worktrees/repo/x",
        "git -C $r worktree add -q $w chore/lockin-prep",
        "git -C . worktree add -q .worktrees/15-translate -b t15 app-v1",
        "git worktree add -q .worktrees/34-unlock-polish -b t34 app-v1",
        "git -C repo worktree remove --force .worktrees/repo/x",
        "git -C repo worktree list",
        "git -C repo log --oneline -1",
        "grep -n 'git -C repo worktree add .worktrees/x' notes.md",
    ]
    for c in block:
        assert verdict(c), f"should block: {c}"
    for c in allow:
        assert not verdict(c), f"should allow: {c} (got {verdict(c)})"
    print(f"selftest ok: {len(block)} blocked, {len(allow)} allowed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
