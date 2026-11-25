#!/usr/bin/env bash
# Install lockin into Claude Code, pi and Cursor by symlink. Idempotent; safe to rerun after a pull.
# usage: ./install.sh [--with-deps] [--check]
#   --with-deps  also install missing dependency skills from deps.txt via `npx skills add -g`
#   --check      report what is installed or missing, change nothing
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd -P)
WITH_DEPS=0; CHECK=0
for a in "$@"; do case $a in --with-deps) WITH_DEPS=1 ;; --check) CHECK=1 ;; *) echo "unknown arg $a"; exit 2 ;; esac; done

say(){ printf '%s\n' "$*"; }

# link <target> <link path>: create or repoint a symlink; never touch a real file or dir.
link(){
  local t=$1 l=$2
  if [ -L "$l" ] && [ "$(readlink "$l")" = "$t" ]; then return 0; fi
  if [ -e "$l" ] && [ ! -L "$l" ]; then say "  SKIP $l exists and is not a symlink"; return 0; fi
  if [ $CHECK = 1 ]; then say "  MISSING $l -> $t"; return 0; fi
  mkdir -p "$(dirname "$l")"; ln -sfn "$t" "$l"; say "  linked $l"
}

say "skills"
for d in "$ROOT"/skills/*/; do
  n=$(basename "$d")
  for dst in ~/.claude/skills ~/.pi/agent/skills ~/.cursor/skills; do link "$ROOT/skills/$n" "$dst/$n"; done
done

say "agents"
for f in "$ROOT"/agents/*.md; do
  [ -e "$f" ] || continue
  n=$(basename "$f")
  for dst in ~/.claude/agents ~/.cursor/agents; do link "$f" "$dst/$n"; done
done

say "hooks"
for f in "$ROOT"/hooks/*.py; do link "$f" ~/.agents/hooks/"$(basename "$f")"; done

say "pi extensions"
for e in "$ROOT"/pi/extensions/*; do link "$e" ~/.pi/agent/extensions/"$(basename "$e")"; done

say "stale links"
# A renamed or deleted skill/agent/hook leaves a dangling symlink into this repo; remove only those.
for dir in ~/.claude/skills ~/.pi/agent/skills ~/.cursor/skills ~/.claude/agents ~/.cursor/agents ~/.agents/hooks ~/.pi/agent/extensions; do
  for l in "$dir"/*; do
    [ -L "$l" ] && [ ! -e "$l" ] || continue
    case $(readlink "$l") in "$ROOT"/*) ;; *) continue ;; esac
    if [ $CHECK = 1 ]; then say "  STALE $l"; else rm "$l"; say "  removed $l"; fi
  done
done

say "hook wiring"
python3 - "$CHECK" <<'EOF'
import json, os, shutil, sys
check = sys.argv[1] == "1"
H = os.path.expanduser("~")

def load(p):
    return json.load(open(p)) if os.path.exists(p) else {}

def save(p, d):
    if os.path.exists(p) and not os.path.exists(p + ".bak-lockin"):
        shutil.copy(p, p + ".bak-lockin")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(d, f, indent=2); f.write("\n")

# Claude Code: guards on Bash, sticky lockin on every prompt.
p = f"{H}/.claude/settings.json"; d = load(p); changed = False
hooks = d.setdefault("hooks", {})
want = [("PreToolUse", "Bash", "python3 $HOME/.agents/hooks/test_guard.py --claude"),
        ("PreToolUse", "Bash", "python3 $HOME/.agents/hooks/mr_guard.py --claude"),
        ("PreToolUse", "Bash", "python3 $HOME/.agents/hooks/worktree_guard.py --claude"),
        ("PreToolUse", "Bash", "python3 $HOME/.agents/hooks/checkout_guard.py --claude"),
        ("UserPromptSubmit", None, "python3 $HOME/.agents/hooks/lockin_mode.py --claude")]
for event, matcher, cmd in want:
    entries = hooks.setdefault(event, [])
    if any(h.get("command") == cmd for e in entries for h in e.get("hooks", [])):
        continue
    print(f"  {'MISSING' if check else 'added'} Claude Code {event}: {cmd}"); changed = True
    entry = next((e for e in entries if e.get("matcher") == matcher), None)
    if entry is None:
        entry = {"matcher": matcher, "hooks": []} if matcher else {"hooks": []}
        entries.append(entry)
    entry["hooks"].append({"type": "command", "command": cmd})
if changed and not check: save(p, d)

# Cursor: guards before shell commands.
p = f"{H}/.cursor/hooks.json"; d = load(p) or {"version": 1, "hooks": {}}; changed = False
b = d.setdefault("hooks", {}).setdefault("beforeShellExecution", [])
for g in ("test_guard", "mr_guard", "worktree_guard", "checkout_guard"):
    cmd = f"python3 {H}/.agents/hooks/{g}.py --cursor"
    if not any(h.get("command") == cmd for h in b):
        print(f"  {'MISSING' if check else 'added'} Cursor beforeShellExecution: {cmd}"); changed = True
        b.append({"command": cmd})
if changed and not check: save(p, d)
EOF

say "dependency skills"
grep -v '^#' "$ROOT/deps.txt" | while read -r pkg list; do
  [ -n "$pkg" ] || continue
  missing=""
  for s in ${list//,/ }; do
    [ -e ~/.agents/skills/"$s"/SKILL.md ] || [ -e ~/.claude/skills/"$s"/SKILL.md ] || missing="$missing,$s"
  done
  missing=${missing#,}
  if [ -z "$missing" ]; then say "  ok $pkg"; continue; fi
  if [ $WITH_DEPS = 1 ] && [ $CHECK = 0 ]; then
    npx -y skills add "$pkg" -g -s "$missing" -y
  else
    say "  MISSING from $pkg: $missing  (rerun with --with-deps, or: npx skills add $pkg -g -s $missing)"
  fi
done

say "done. New skills, agents and hooks load in the next session."
