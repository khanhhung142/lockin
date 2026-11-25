#!/usr/bin/env python3
"""Block branch switches in a repo's main checkout. Shared by Claude Code, Cursor and pi.

The main checkout (the repo dir itself, not a linked worktree) is the one the user works in and `make dev` runs from.
Agents read other branches with `git show <ref>:<path>`, and build or merge in a worktree under <project>/.worktrees/.
Past mistakes: Grind runs switched api-server and web-frontend off the user's branch to read code
(2026-11-23 price-sheet) and to merge into feature/bulk-edit (2026-11-23).

Blocks `git checkout <branch|commit>`, `git checkout -b/-B/--detach/--orphan`, `git switch ...` when the target dir is a
main checkout and the branch would change. Allows file restores (`git checkout -- f`, `git checkout <ref> <path>`),
linked worktrees, no-ops (already on that branch), and an explicit `ALLOW_CHECKOUT=1` prefix (the user asked for it).

Modes (stdin = the tool's hook JSON), same contract as test_guard.py and worktree_guard.py:
  --claude   PreToolUse:  {"tool_input": {"command": ...}, "cwd": ...} -> exit 2 + stderr to block
  --cursor   beforeShellExecution: {"command": ..., "cwd": ...} -> stdout {"permission": ...}
  --check    plain command string as argv[2], cwd = process cwd; exit 2 + stderr reason to block (pi)
  --selftest run the asserts below
"""
import json
import os
import re
import shlex
import subprocess
import sys

SWITCH_FLAGS = {"-b", "-B", "--orphan", "--detach", "-c", "-C", "--create", "--force-create"}
VALUE_FLAGS = {"-b", "-B", "--orphan", "-c", "-C", "--create", "--force-create", "--conflict", "--pathspec-from-file"}


def git(d, *args):
    r = subprocess.run(["git", "-C", d, *args], capture_output=True, text=True, timeout=5)
    return r.stdout.strip() if r.returncode == 0 else None


def expand(word, env):
    # shortcut: expands only $VAR / ${VAR} set earlier in the same command and ~; anything else stays unresolved.
    word = os.path.expanduser(word)
    word = re.sub(r"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?", lambda m: env.get(m.group(1), m.group(0)), word)
    return None if "$" in word else word


def drop_redirects(toks):
    out, skip = [], False
    for t in toks:
        if skip:
            skip = False
        elif re.match(r"^\d*>>?", t) or t == "<":
            skip = re.fullmatch(r"\d*>>?|<", t) is not None  # bare operator: the file is the next token
        else:
            out.append(t)
    return out


def is_main_checkout(d):
    gd, cd = git(d, "rev-parse", "--absolute-git-dir"), git(d, "rev-parse", "--path-format=absolute", "--git-common-dir")
    return gd is not None and gd == cd


def switch_target(sub, args, d):
    """The ref the command would switch to ('' for a new or detached branch), or None when it changes no branch."""
    if "--" in args:
        return None
    pos, new, i = [], False, 0
    while i < len(args):
        a = args[i]
        if a in SWITCH_FLAGS:
            new = True
        if a in VALUE_FLAGS:
            i += 2
            continue
        if not a.startswith("-"):
            pos.append(a)
        i += 1
    if new:
        return ""
    if sub == "checkout":
        if len(pos) != 1 or git(d, "rev-parse", "--verify", "--quiet", pos[0] + "^{commit}") is None:
            return None  # `git checkout <path>` or `git checkout <ref> <path>` restores files
    return pos[0] if pos else None


def verdict(cmd: str, cwd: str):
    cwd, env = os.path.abspath(cwd), {}
    # shortcut: splits on ; & | and newlines without honouring quotes; a separator inside a quoted arg may misparse.
    for seg in re.split(r"[;&|\n]+", re.sub(r"\d*>&\d+", " ", cmd)):
        try:
            toks = drop_redirects(shlex.split(seg))
        except ValueError:
            continue
        while toks and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0]):
            k, v = toks.pop(0).split("=", 1)
            env[k] = v
        if not toks:
            continue
        if toks[0] == "cd" and len(toks) > 1:
            p = expand(toks[1], env)
            cwd = os.path.normpath(os.path.join(cwd, p)) if p and cwd else None
            continue
        if env.get("ALLOW_CHECKOUT") == "1" or toks[0] != "git" or cwd is None:
            continue
        j, d = 1, cwd
        while j < len(toks) and toks[j].startswith("-"):  # git's own options
            if toks[j] == "-C" and j + 1 < len(toks):
                p = expand(toks[j + 1], env)
                d = os.path.normpath(os.path.join(d, p)) if p and d else None
                j += 2
                continue
            j += 2 if toks[j] in ("-c", "--git-dir", "--work-tree") else 1
        if j >= len(toks) or toks[j] not in ("checkout", "switch") or d is None or not os.path.isdir(d):
            continue
        target = switch_target(toks[j], toks[j + 1:], d)
        if target is None or not is_main_checkout(d):
            continue
        current = git(d, "symbolic-ref", "--quiet", "--short", "HEAD")
        if target and target == current:
            continue
        return git(d, "rev-parse", "--show-toplevel") or d, current, " ".join(toks[j:])
    return None


def message(hit):
    repo, current, sub = hit
    return (f"checkout-guard: `git {sub}` would switch {repo} off `{current or 'its HEAD'}`; that is the user's main checkout. "
            f"Read another branch with `git show <ref>:<path>` or `git grep <pattern> <ref>`; build, test or merge in a worktree "
            f"(`git -C <repo> worktree add \"$PWD/.worktrees/<repo>/<name>\" <branch>`, or the integration branch's existing worktree in `git worktree list`). "
            f"If the user asked for this switch, prefix the command with ALLOW_CHECKOUT=1.")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    if mode == "--selftest":
        return selftest()
    cwd = os.getcwd()
    if mode == "--check":
        cmd = sys.argv[2] if len(sys.argv) > 2 else sys.stdin.read()
    else:
        try:
            data = json.load(sys.stdin)
        except Exception:
            return 0  # fail open on malformed input: never break the agent's shell
        cmd = (data.get("tool_input") or {}).get("command", "") if mode == "--claude" else data.get("command", "")
        cwd = data.get("cwd") or cwd
    try:
        hit = verdict(cmd or "", cwd)
    except Exception:
        hit = None  # fail open: a guard bug must never block the agent's shell
    if mode == "--cursor":
        out = {"permission": "deny", "agent_message": message(hit), "user_message": "checkout-guard: branch switch in a main checkout"} if hit else {"permission": "allow"}
        print(json.dumps(out))
        return 0
    if hit:
        sys.stderr.write(message(hit) + "\n")
        return 2
    return 0


def selftest():
    import tempfile
    proj = tempfile.mkdtemp(prefix="checkout-guard-")
    run = lambda *a, d=proj: subprocess.run(a, cwd=d, check=True, capture_output=True)
    for repo, branch in (("api-server", "dev"), ("web-frontend", "release/v1.0")):
        r = os.path.join(proj, repo)
        os.makedirs(r)
        run("git", "init", "-q", "-b", branch, d=r)
        run("git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init", d=r)
        for b in ("version/v1.2", "dev", "feature/bulk-edit", "feature/bulk-edit-01"):
            if b != branch:
                run("git", "branch", b, d=r)
        os.makedirs(os.path.join(r, "src"))
        open(os.path.join(r, "src", "routeTree.gen.ts"), "w").close()
    fe = os.path.join(proj, "web-frontend")
    wt = os.path.join(proj, ".worktrees", "web-frontend", "bulk-edit")
    run("git", "worktree", "add", "-q", wt, "feature/bulk-edit", d=fe)
    block = [
        # the real mistakes, paths moved into the temp project
        (f"cd {proj}/api-server; git checkout -q version/v1.2 2>&1; git status -sb | head -2", proj),
        (f"cd {proj}/web-frontend; git checkout -q dev && git status -sb | head -1", proj),
        (f"cd {proj}; git -C api-server status --short | head -3; git -C api-server checkout -q version/v1.2 && git -C web-frontend checkout -q dev", proj),
        (f"cd {proj}; R=web-frontend; git -C $R checkout -q feature/bulk-edit-01 2>&1 || true; git -C $R branch --show-current", proj),
        ("git switch dev", fe),
        ("git checkout -b chore/x", fe),
        ("git checkout --detach dev", fe),
        ("git -C web-frontend switch -c tmp", proj),
    ]
    allow = [
        ("git checkout -q release/v1.0", fe),  # already there
        ("git checkout src/routeTree.gen.ts", fe),
        ("git checkout -q -- .", fe),
        ("git checkout dev -- src/routeTree.gen.ts", fe),
        ("git checkout -q -B tmp-flake", wt),
        (f"cd {wt}; git checkout -q --detach dev", proj),
        ("ALLOW_CHECKOUT=1 git -C web-frontend checkout dev", proj),
        ("git -C $r checkout dev", proj),  # unresolved: fail open
        ("git -C web-frontend show dev:src/routeTree.gen.ts", proj),
        ("grep -n 'git checkout dev' notes.md", proj),
    ]
    for c, d in block:
        assert verdict(c, d), f"should block: {c}"
    for c, d in allow:
        assert not verdict(c, d), f"should allow: {c} (got {verdict(c, d)})"
    subprocess.run(["rm", "-rf", proj])
    print(f"selftest ok: {len(block)} blocked, {len(allow)} allowed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
