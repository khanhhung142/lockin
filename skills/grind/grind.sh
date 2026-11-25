#!/usr/bin/env bash
# grind.sh - mechanical state ops for the `grind` skill, so the orchestrator
# agent spends no tokens computing progress or the frontier.
# Assumes /to-tickets local format: files .scratch/<feature>/issues/NN-*.md with
# a "**Status:** <x>" line and a "**Blocked by:** ..." line (numbers or "None").
# A ticket is "done" when its Status line contains the word done.
#
# usage:
#   grind.sh status   <feature-dir>          progress table + summary + frontier
#   grind.sh frontier <feature-dir>          ready ticket numbers (blockers all done), one per line
#   grind.sh set      <ticket-file> <status> stamp the Status line (done refuses while a "- [ ]" box is open)
#   grind.sh repos    <feature-dir>          repos the tickets touch (multi-repo projects)
#   grind.sh check    <feature-dir>          fail unless every ticket names exactly one existing repo
# Multi-repo projects (project folder is not a git repo): each ticket has a
# "**Repo:** <dir>" line naming a child git repo of the project folder.
set -euo pipefail

issues_dir(){ local d=$1; [ -d "$d/issues" ] && echo "$d/issues" || echo "$d"; }
num_of(){ basename "$1" | grep -oE '^[0-9]+' ; }                       # NN from filename
status_of(){ grep -iE '^\**Status:' "$1" | head -1 | sed -E 's/^\**Status:\**[[:space:]]*//' | tr -d '*' | xargs || echo "?"; }
is_done(){ status_of "$1" | grep -qi done; }
repo_of(){ grep -iE '^\**Repo:' "$1" | head -1 | sed -E 's/^\**Repo:\**[[:space:]]*//' | tr -d '*`' | xargs || true; }
project_of(){ (cd "$1/../.." && pwd -P); }                             # <project>/.scratch/<feature>
blockers_of(){ # numbers on the Blocked by line; empty if None
  local line; line=$(grep -iE '^\**Blocked by:' "$1" | head -1 || true)
  echo "$line" | grep -qi none && return 0
  echo "$line" | grep -oE '[0-9]+' || true
}

cmd_status(){
  local dir; dir=$(issues_dir "$1"); local done=0 total=0 fr
  printf "%-4s %-16s %-24s %s\n" "NN" "STATUS" "REPO" "BLOCKED-BY"
  for f in "$dir"/[0-9]*.md; do
    [ -e "$f" ] || continue
    total=$((total+1))
    local n s b r; n=$(num_of "$f"); s=$(status_of "$f"); b=$(blockers_of "$f" | paste -sd, - ); r=$(repo_of "$f")
    printf "%-4s %-16s %-24s %s\n" "$n" "$s" "${r:--}" "${b:-none}"
    if is_done "$f"; then done=$((done+1)); fi
  done
  fr=$(cmd_frontier "$1" | paste -sd' ' -)
  local ready; ready=$(cmd_frontier "$1" | grep -c . || true)
  echo "---"
  echo "done $done / $total   ready(frontier): ${fr:-none}   blocked: $((total-done-ready))"
}

cmd_frontier(){
  local dir; dir=$(issues_dir "$1") done_nums=" "
  for f in "$dir"/[0-9]*.md; do [ -e "$f" ] || continue; is_done "$f" && done_nums="$done_nums$(num_of "$f") "; done
  for f in "$dir"/[0-9]*.md; do
    [ -e "$f" ] || continue
    is_done "$f" && continue
    local ok=1
    for b in $(blockers_of "$f"); do case "$done_nums" in *" $b "*) ;; *) ok=0 ;; esac; done
    [ "$ok" = 1 ] && num_of "$f"
  done
}

cmd_set(){
  local f=$1 st=$2 open
  # done means every acceptance box is proven; several runs stamped done over unticked boxes.
  if echo "$st" | grep -qi done && open=$(grep -nE '^[[:space:]]*[-*] \[ \]' "$f"); then
    echo "$(basename "$f"): not done, acceptance boxes still open:" >&2
    echo "$open" >&2
    echo "Tick each box the implementer's result proves (- [x]), or set needs-human with what is left." >&2
    return 1
  fi
  grep -qiE '^\**Status:' "$f" \
    && sed -i '' -E "s/^(\**Status:\**[[:space:]]*).*/\1$st/" "$f" \
    || printf '\n**Status:** %s\n' "$st" >> "$f"
  echo "set $(num_of "$f") -> $st"
}

cmd_repos(){
  local dir; dir=$(issues_dir "$1")
  for f in "$dir"/[0-9]*.md; do [ -e "$f" ] && repo_of "$f"; done | grep . | sort -u || true
}

cmd_check(){
  local dir proj bad=0; dir=$(issues_dir "$1"); proj=$(project_of "$1")
  if git -C "$proj" rev-parse --show-toplevel >/dev/null 2>&1 && [ "$(git -C "$proj" rev-parse --show-toplevel)" = "$proj" ]; then
    echo "single-repo project ($proj): Repo lines optional"; return 0
  fi
  for f in "$dir"/[0-9]*.md; do
    [ -e "$f" ] || continue
    local r; r=$(repo_of "$f")
    if [ -z "$r" ]; then echo "$(basename "$f"): missing **Repo:** line"; bad=1
    elif echo "$r" | grep -qE '[ ,]'; then echo "$(basename "$f"): one repo per ticket, got '$r' (split the ticket)"; bad=1
    elif [ ! -e "$proj/$r/.git" ]; then echo "$(basename "$f"): repo '$r' is not a git repo under $proj"; bad=1
    fi
  done
  [ "$bad" = 0 ] && echo "ok: $(cmd_repos "$1" | paste -sd' ' -)"
  return "$bad"
}

case "${1:-}" in
  status)   cmd_status "$2" ;;
  frontier) cmd_frontier "$2" ;;
  set)      cmd_set "$2" "$3" ;;
  repos)    cmd_repos "$2" ;;
  check)    cmd_check "$2" ;;
  *) echo "usage: grind.sh {status <dir>|frontier <dir>|set <ticket-file> <status>|repos <dir>|check <dir>}"; exit 1 ;;
esac
