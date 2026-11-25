/**
 * Guards - the same shell guards Claude Code and Cursor run, from the shared scripts in ~/.agents/hooks.
 *
 * - test_guard.py: blocks whole-suite test runs (`go test ./...`, bare Playwright/e2e, `make test`) unless prefixed FULL=1.
 * - mr_guard.py: blocks MRs into main/master and direct pushes to main/master.
 * - worktree_guard.py: blocks `git -C <repo> worktree add <relative path>`, which lands the worktree inside the repo.
 * - checkout_guard.py: blocks branch switches (`git checkout <branch>`, `git switch`) in a repo's main checkout.
 * Rules live in the Python scripts, not here; a new global guard is one more name in GUARDS.
 */

import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HOOKS = join(homedir(), ".agents", "hooks");
const GUARDS = ["test_guard.py", "mr_guard.py", "worktree_guard.py", "checkout_guard.py"];

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash") return undefined;
		const cmd = String(event.input.command ?? "");
		for (const guard of GUARDS) {
			const r = spawnSync("python3", [join(HOOKS, guard), "--check", cmd], { encoding: "utf8", timeout: 15000 });
			if (r.status === 2) return { block: true, reason: (r.stderr ?? "").trim() };
		}
		return undefined;
	});
}
