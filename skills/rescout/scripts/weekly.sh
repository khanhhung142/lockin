#!/usr/bin/env bash
# Weekly full /rescout pass on the latest base branch of every repo in a lockin project.
#   weekly.sh <project>                   run now: fetch each repo's base branch, refresh detached worktrees, run the pass
#   weekly.sh --dry-run <project>         prepare the worktrees and print the env and the agent command, run nothing
#   weekly.sh --install <project> [weekday 1-7] [hour]   schedule it with launchd (default Monday 09:00)
#   weekly.sh --uninstall <project>
# Base branches come from the "Base branch" column of the project AGENTS.md repo table.
# WEEKLY_BRANCH=<branch> overrides it for every repo (a project whose local stack and docs track e.g. stage, not the MR base);
# WEEKLY_PULL=1 also pulls a main checkout that sits on that branch: fast-forward, or rebase its local-only commits when clean (never anything else; skipped when it cannot).
# WEEKLY_FETCH=0 skips the fetch and uses the origin/<branch> refs already on disk (projects where agents must not fetch).
# Set them (and VERIFY_PORT_BASE when the skill constrains it) when running --install; the schedule keeps them. --dry-run never fetches.
# The main checkouts are never touched: the pass runs in <project>/.worktrees/<repo>/maintain-weekly (detached, kept for reuse).
# Needs the verify skill to follow the VERIFY_<REPO>_DIR / VERIFY_PORT_BASE / VERIFY_DB convention (scout).
set -euo pipefail

# Unattended under launchd: a failure must reach the user, not only the log.
die() { echo "weekly: $*" >&2; osascript -e "display notification \"$*\" with title \"rescout: blocked\"" 2>/dev/null || true; exit 1; }
mode=run
case "${1:-}" in --dry-run|--install|--uninstall) mode="${1#--}"; shift ;; esac
[ -n "${1:-}" ] || die "usage: weekly.sh [--dry-run|--install|--uninstall] <project-dir>"
PROJECT="$(cd "$1" && pwd -P)"
NAME="$(basename "$PROJECT")"
LABEL="lockin.rescout.$NAME"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/.agents/lockin/maintain"

if [ "$mode" = uninstall ]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"; echo "removed $LABEL"; exit 0
fi

if [ "$mode" = install ]; then
  mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>$(cd "$(dirname "$0")" && pwd -P)/weekly.sh</string><string>$PROJECT</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Weekday</key><integer>${2:-1}</integer><key>Hour</key><integer>${3:-9}</integer><key>Minute</key><integer>0</integer>
  </dict>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATH</string><key>HOME</key><string>$HOME</string>${WEEKLY_BRANCH:+<key>WEEKLY_BRANCH</key><string>$WEEKLY_BRANCH</string>}${WEEKLY_FETCH:+<key>WEEKLY_FETCH</key><string>$WEEKLY_FETCH</string>}${WEEKLY_PULL:+<key>WEEKLY_PULL</key><string>$WEEKLY_PULL</string>}${VERIFY_PORT_BASE:+<key>VERIFY_PORT_BASE</key><string>$VERIFY_PORT_BASE</string>}</dict>
  <key>StandardOutPath</key><string>$LOG_DIR/$NAME.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/$NAME.log</string>
</dict></plist>
PLIST
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "scheduled $LABEL: weekday ${2:-1} at ${3:-9}:00${WEEKLY_BRANCH:+ on $WEEKLY_BRANCH} (a missed run fires on wake); log $LOG_DIR/$NAME.log"
  exit 0
fi

SKILL="$(ls -d "$PROJECT"/.agents/skills/verify-* 2>/dev/null | head -1)"
[ -n "$SKILL" ] || die "no .agents/skills/verify-* in $PROJECT"
SKILL_NAME="$(basename "$SKILL")"
LOCK="$PROJECT/.scratch/$SKILL_NAME/weekly.lock"
mkdir -p "$(dirname "$LOCK")"
mkdir "$LOCK" 2>/dev/null || die "a weekly pass is already running ($LOCK)"
trap 'rmdir "$LOCK"' EXIT

# Repo table: first backticked token of the "Repo" and "Base branch" columns.
TABLE="$(awk -F'|' '
  col && !/^\|/ { exit }
  /^\|/ && !col { for (i = 1; i <= NF; i++) if ($i ~ /Base branch/) col = i; next }
  col && match($2, /`[^`]+`/) { r = substr($2, RSTART + 1, RLENGTH - 2); if (match($col, /`[^`]+`/)) print r, substr($col, RSTART + 1, RLENGTH - 2) }
' "$PROJECT/AGENTS.md")"
[ -n "$TABLE" ] || die "no repo table with a Base branch column in $PROJECT/AGENTS.md"

ENV_LINES=""
while read -r repo base; do
  base="${WEEKLY_BRANCH:-$base}"
  dir="$PROJECT/$repo"; wt="$PROJECT/.worktrees/$repo/maintain-weekly"
  [ -d "$dir/.git" ] || die "$repo is not a git repo"
  if [ "$mode" = run ] && [ "${WEEKLY_FETCH:-1}" != 0 ]; then
    git -C "$dir" fetch -q origin "$base" || die "fetch $repo origin/$base failed (VPN connected?)"
    if [ "${WEEKLY_PULL:-0}" = 1 ]; then
      # Fast-forward; a checkout that keeps local-only commits (e.g. a never-pushed .gitignore) is rebased onto
      # origin/<branch> instead, only when its tracked files are clean, and any conflict is aborted untouched.
      if [ "$(git -C "$dir" symbolic-ref -q --short HEAD)" != "$base" ]; then echo "weekly: $repo main checkout not on $base, not pulled"
      elif git -C "$dir" merge -q --ff-only "origin/$base" 2>/dev/null; then :
      elif [ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ] && git -C "$dir" rebase -q "origin/$base" >/dev/null 2>&1; then
        echo "weekly: $repo rebased $(git -C "$dir" rev-list --count "origin/$base..HEAD") local commit(s) onto origin/$base"
      else git -C "$dir" rebase --abort 2>/dev/null; echo "weekly: $repo main checkout not pulled (local changes or a rebase conflict)"; fi
    fi
  fi
  git -C "$dir" rev-parse -q --verify "origin/$base" >/dev/null || die "$repo has no origin/$base"
  if [ -d "$wt" ]; then git -C "$wt" checkout -q --detach "origin/$base"
  else mkdir -p "$(dirname "$wt")"; git -C "$dir" worktree add -q --detach "$wt" "origin/$base"; fi
  if [ -f "$wt/package-lock.json" ] && ! cmp -s "$wt/package-lock.json" "$wt/node_modules/.weekly-lock" 2>/dev/null; then
    (cd "$wt" && npm ci --silent --no-audit --no-fund && cp package-lock.json node_modules/.weekly-lock) || die "npm ci in $wt failed"
  fi
  var="VERIFY_$(echo "$repo" | tr '[:lower:]' '[:upper:]' | tr -c 'A-Z0-9\n' '_')_DIR"
  export "$var=$wt"
  ENV_LINES="$ENV_LINES  $var=$wt ($repo at origin/$base $(git -C "$wt" rev-parse --short HEAD))
"
done <<< "$TABLE"
export VERIFY_PORT_BASE="${VERIFY_PORT_BASE:-19870}"
export VERIFY_DB="${VERIFY_DB:-$(echo "${SKILL_NAME#verify-}" | tr -c 'a-z0-9\n' '_')_verify_weekly}"

DATE="$(date +%Y%m%d)"
PROMPT="Read ~/.claude/skills/rescout/SKILL.md and run one FULL pass on $SKILL (project $PROJECT), unattended.
Every repo is checked out at the latest base branch in a detached worktree, and these env vars are already exported; keep them for every script you run:
$ENV_LINES  VERIFY_PORT_BASE=$VERIFY_PORT_BASE VERIFY_DB=$VERIFY_DB
Never touch the main checkouts, never edit product code, never push or open an MR.
Business questions and product bugs go into the notes for the user, not into a fix.
Write the notes to $PROJECT/.scratch/$SKILL_NAME/maintain-$DATE.md, run the skill's cleanup, and end your reply with one line: OUTCOME: clean|changed|blocked - <one-line reason>."

if [ "$mode" = dry-run ]; then
  printf 'env:\n%s  VERIFY_PORT_BASE=%s VERIFY_DB=%s\n\nagent: claude -p --dangerously-skip-permissions <prompt>\n\n%s\n' "$ENV_LINES" "$VERIFY_PORT_BASE" "$VERIFY_DB" "$PROMPT"
  exit 0
fi

OUT="$PROJECT/.scratch/$SKILL_NAME/weekly-$DATE.log"
echo "weekly: $NAME pass started $(date), log $OUT"
(cd "$PROJECT" && claude -p --dangerously-skip-permissions "$PROMPT") > "$OUT" 2>&1 || true
RESULT="$(grep -o 'OUTCOME: .*' "$OUT" | tail -1)"
echo "weekly: $NAME ${RESULT:-OUTCOME: blocked - agent gave no outcome, see $OUT}"
osascript -e "display notification \"${RESULT:-no outcome, see log}\" with title \"rescout: $NAME\"" 2>/dev/null || true
