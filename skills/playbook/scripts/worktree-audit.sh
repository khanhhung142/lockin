#!/usr/bin/env bash
# Read-only worktree prune audit. Classifies every git worktree of a repo by
# size, age, merge state, uncommitted work, remote branch state, and the most
# recent agent session (Claude Code, pi, Cursor) that touched it. Emits a table
# sorted by size with a suggested bucket. Never deletes anything; deletion stays
# a human-gated step in the worktree-cleanup playbook.
#
# Usage: worktree-audit.sh [-b|--base <ref>] [repo-path]
#   repo-path defaults to the current repo.
#   -b sets the ref the MERGED column checks against (e.g. origin/stable).
#   Without it the base is origin/HEAD, then origin/main, then origin/master.
#
# Buckets: hold-wip (tracked uncommitted edits), verify-recent-chat (a session
# touched it in the last 4 days), safe (HEAD is an ancestor of the base),
# likely-merged (upstream branch deleted on the remote, typical after a GitLab
# squash merge; confirm the MR), review (anything else).
#
# Adapted from pstack's worktree-audit.sh (MIT, copyright 2026 Lauren Tan).
set -u

base=""
while [ $# -gt 0 ]; do
	case "$1" in
	-b|--base) [ $# -ge 2 ] || { echo "error: $1 needs a ref" >&2; exit 2; }; base="$2"; shift 2 ;;
	-h|--help) sed -n '2,/^set -u/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit 0 ;;
	-*) echo "error: unknown option: $1" >&2; exit 2 ;;
	*) break ;;
	esac
done

repo="${1:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$repo" ] && { echo "not in a git repo; pass a repo path" >&2; exit 1; }
cd "$repo" || exit 1
git rev-parse --git-dir >/dev/null 2>&1 || { echo "error: not a git repo: $repo" >&2; exit 1; }

main_wt=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')

# Best-effort fetch with prune, so deleted remote branches show as "gone".
GIT_TERMINAL_PROMPT=0 git fetch --prune origin --quiet 2>/dev/null || echo "warn: fetch failed; remote columns may be stale" >&2

if [ -z "$base" ]; then
	for cand in "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" origin/main origin/master; do
		[ -n "$cand" ] && git rev-parse --verify --quiet "$cand^{commit}" >/dev/null && { base="$cand"; break; }
	done
	[ -z "$base" ] && { echo "error: no base ref (origin/HEAD, origin/main, origin/master all missing); pass -b <ref>" >&2; exit 1; }
	echo "warn: no -b given; MERGED checks against $base" >&2
fi
git rev-parse --verify --quiet "$base^{commit}" >/dev/null 2>&1 || { echo "error: base ref not found: $base" >&2; exit 1; }

if stat -c %Y / >/dev/null 2>&1; then
	mtime() { stat -c '%Y' "$1"; }
	fmt_day() { date -d "@$1" '+%Y-%m-%d'; }
else
	mtime() { stat -f '%m' "$1"; }
	fmt_day() { date -r "$1" '+%Y-%m-%d'; }
fi

# Session transcript dirs for this repo only: dirs whose project path is the
# repo, inside it (worktrees under the repo), or an ancestor below $HOME (a
# workspace that contains the repo). Never other workspaces.
cc_slug() { printf '%s' "$1" | sed 's#[^A-Za-z0-9]#-#g'; }
pi_slug() { printf -- '--%s--' "$(printf '%s' "${1#/}" | sed 's#/#-#g')"; }
cur_slug() { printf '%s' "${1#/}" | sed 's#/#-#g'; }

dirs_file=$(mktemp)
trap 'rm -f "$dirs_file"' EXIT
add_dirs_for() {
	p="$1"
	for d in "$HOME/.claude/projects/$(cc_slug "$p")"* \
		"$HOME/.pi/agent/sessions/$(pi_slug "$p")" \
		"$HOME/.pi/agent/sessions/$(pi_slug "$p" | sed 's/--$//')"-* \
		"$HOME/.cursor/projects/$(cur_slug "$p")"*/agent-transcripts; do
		[ -d "$d" ] && echo "$d" >>"$dirs_file"
	done
}
add_dirs_for "$main_wt"
p=$(dirname "$main_wt")
while [ "${#p}" -gt "${#HOME}" ]; do
	for d in "$HOME/.claude/projects/$(cc_slug "$p")" "$HOME/.pi/agent/sessions/$(pi_slug "$p")" \
		"$HOME/.cursor/projects/$(cur_slug "$p")/agent-transcripts"; do
		[ -d "$d" ] && echo "$d" >>"$dirs_file"
	done
	p=$(dirname "$p")
done

now=$(date +%s)
echo "# base: $base"
echo "# transcript dirs: $(sort -u "$dirs_file" | wc -l | tr -d ' ')"
printf "SIZE\tAGE\tMERGED\tDIRTY\tREMOTE\tLAST_CHAT\tBUCKET\tWORKTREE\n"

git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
	[ "$wt" = "$main_wt" ] && continue
	add_dirs_for "$wt"

	size=$(du -sh "$wt" 2>/dev/null | awk '{print $1}')
	head=$(git -C "$wt" rev-parse HEAD 2>/dev/null)
	head_ts=$(git -C "$wt" log -1 --format='%ct' HEAD 2>/dev/null || echo 0)
	age=$([ "$head_ts" -gt 0 ] 2>/dev/null && echo "$(( (now - head_ts) / 86400 ))d" || echo "?")

	git merge-base --is-ancestor "$head" "$base" 2>/dev/null && merged=YES || merged=no

	porcelain=$(git -C "$wt" status --porcelain 2>/dev/null)
	if [ -z "$porcelain" ]; then dirty=clean
	elif printf '%s\n' "$porcelain" | grep -qv '^??'; then
		dirty="wip:$(printf '%s\n' "$porcelain" | grep -cv '^??')"
	else dirty="scratch:$(printf '%s\n' "$porcelain" | grep -c '^??')"; fi

	branch=$(git -C "$wt" symbolic-ref --quiet --short HEAD 2>/dev/null || echo "")
	if [ -z "$branch" ]; then remote=detached
	elif git -C "$wt" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
		[ "$(git -C "$wt" rev-parse "origin/$branch" 2>/dev/null)" = "$head" ] \
			&& remote=pushed \
			|| remote="ahead$(git -C "$wt" rev-list --count "origin/$branch..HEAD" 2>/dev/null)"
	elif [ -n "$(git -C "$wt" config "branch.$branch.merge" 2>/dev/null)" ]; then remote=gone
	else remote=no-remote; fi

	# Newest session file mentioning this worktree path followed by "/" or a
	# quote, so foo-1 does not match foo-12.
	last="-"; last_ts=0
	if [ -s "$dirs_file" ]; then
		for f in $(sort -u "$dirs_file" | tr '\n' '\0' | xargs -0 grep -rlF -e "$wt/" -e "$wt\"" 2>/dev/null); do
			t=$(mtime "$f" 2>/dev/null || echo 0)
			[ "$t" -gt "$last_ts" ] && last_ts=$t
		done
		[ "$last_ts" -gt 0 ] && last=$(fmt_day "$last_ts")
	fi
	recent=$([ "$last_ts" -gt 0 ] && [ $(( (now - last_ts) / 86400 )) -le 4 ] && echo yes || echo no)

	case "$dirty" in wip:*) bucket=hold-wip ;; *)
		if [ "$recent" = yes ]; then bucket=verify-recent-chat
		elif [ "$merged" = YES ]; then bucket=safe
		elif [ "$remote" = gone ]; then bucket=likely-merged
		else bucket=review; fi ;;
	esac

	printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
		"$size" "$age" "$merged" "$dirty" "$remote" "$last" "$bucket" "$wt"
done | sort -t "$(printf '\t')" -k1,1 -rh
