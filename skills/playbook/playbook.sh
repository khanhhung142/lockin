#!/usr/bin/env bash
# Usage log and index for the playbook skill. Bash 3.2 compatible.
#
#   playbook.sh use <name>   append "ISO-date<TAB>name<TAB>$PWD<TAB>${AGENT:-unknown}" to the log
#   playbook.sh report       every playbook with use count and last-used date, sorted by count
#   playbook.sh list         playbook names
#   playbook.sh selftest     exercise the commands against a temp log
#
# Env: PLAYBOOK_LOG (default ~/.agents/playbook-usage.tsv), AGENT (who used it).
set -eu

self="$0"
dir=$(cd "$(dirname "$0")" && pwd)
pbdir="$dir/playbooks"
log="${PLAYBOOK_LOG:-$HOME/.agents/playbook-usage.tsv}"

list() {
	for f in "$pbdir"/*.md; do
		b=${f##*/}
		echo "${b%.md}"
	done
}

use() {
	name="${1:-}"
	if [ -z "$name" ] || ! list | grep -qx -- "$name"; then
		echo "unknown playbook: '$name'. Known:" >&2
		list >&2
		exit 2
	fi
	mkdir -p "$(dirname "$log")"
	printf '%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$name" "$PWD" "${AGENT:-unknown}" >>"$log"
	echo "logged: $name"
}

report() {
	printf 'COUNT\tLAST_USED\tPLAYBOOK\n'
	list | awk -F'\t' -v logf="$log" '
		BEGIN {
			while ((getline line < logf) > 0) {
				n = split(line, f, "\t")
				if (n < 2) continue
				c[f[2]]++
				if (f[1] > last[f[2]]) last[f[2]] = f[1]
			}
		}
		{ printf "%d\t%s\t%s\n", c[$0] + 0, ($0 in last) ? substr(last[$0], 1, 10) : "-", $0 }
	' | sort -t "$(printf '\t')" -k1,1nr -k3,3
}

fail() {
	echo "selftest FAIL: $*" >&2
	exit 1
}

selftest() {
	tmp=$(mktemp -d)
	trap 'rm -rf "$tmp"' EXIT
	t="$tmp/usage.tsv"
	total=$(list | wc -l | tr -d ' ')
	[ "$total" -gt 0 ] || fail "no playbooks found in $pbdir"

	PLAYBOOK_LOG="$t" AGENT=selftest "$self" use bug-fix >/dev/null
	PLAYBOOK_LOG="$t" AGENT=selftest "$self" use bug-fix >/dev/null
	PLAYBOOK_LOG="$t" "$self" use feature >/dev/null
	if PLAYBOOK_LOG="$t" "$self" use no-such-playbook 2>/dev/null; then fail "unknown name accepted"; fi
	if PLAYBOOK_LOG="$t" "$self" use 2>/dev/null; then fail "empty name accepted"; fi

	[ "$(wc -l <"$t" | tr -d ' ')" = 3 ] || fail "expected 3 log lines"
	awk -F'\t' 'NF != 4 { exit 1 }' "$t" || fail "log line without 4 tab fields"
	awk -F'\t' '$1 !~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z$/ { exit 1 }' "$t" || fail "bad ISO date"
	head -1 "$t" | cut -f4 | grep -qx selftest || fail "AGENT not recorded"
	sed -n 3p "$t" | cut -f4 | grep -qx unknown || fail "AGENT default not 'unknown'"
	head -1 "$t" | cut -f3 | grep -qx "$PWD" || fail "PWD not recorded"

	out=$(PLAYBOOK_LOG="$t" "$self" report)
	echo "$out" | sed -n 2p | grep -q "^2	[0-9-]*	bug-fix$" || fail "bug-fix should lead with count 2"
	echo "$out" | sed -n 3p | grep -q "^1	[0-9-]*	feature$" || fail "feature should be second with count 1"
	[ "$(echo "$out" | sed 1d | wc -l | tr -d ' ')" = "$total" ] || fail "report must list all $total playbooks"
	echo "$out" | grep -q "^0	-	figure-it-out$" || fail "zero-use playbook missing"
	[ "$(PLAYBOOK_LOG="$tmp/missing.tsv" "$self" report | sed 1d | grep -c '^0	-	')" = "$total" ] \
		|| fail "report with no log should list every playbook at zero"

	echo "selftest ok: $total playbooks, use/report/list behave"
}

case "${1:-}" in
use) shift; use "$@" ;;
report) report ;;
list) list ;;
selftest) selftest ;;
*) sed -n '2,/^set -eu/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit 2 ;;
esac
