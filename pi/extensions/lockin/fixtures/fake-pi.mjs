// Stand-in for `pi --mode json --print --no-session ...` used by index.test.mjs.
// Echoes its argv back as one assistant message_end event and tracks concurrency in FAKE_PI_DIR.
import * as fs from "node:fs";
import * as path from "node:path";

const args = process.argv.slice(2);
const task = args[args.indexOf("--") + 1];
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dir = process.env.FAKE_PI_DIR;
const me = path.join(dir, `running-${process.pid}`);
fs.writeFileSync(me, "");
const running = fs.readdirSync(dir).filter((f) => f.startsWith("running-")).length;
fs.appendFileSync(path.join(dir, "peaks"), `${running}\n`);
await new Promise((r) => setTimeout(r, 150));
fs.rmSync(me);

const prompt = flag("--append-system-prompt");
const echo = {
	task,
	model: flag("--model") ?? null,
	tools: flag("--tools") ?? null,
	exclude: flag("--exclude-tools") ?? null,
	prompt: prompt ? fs.readFileSync(prompt, "utf8") : null,
	cwd: process.cwd(),
	depth: process.env.LOCKIN_SUBAGENT_DEPTH,
};
if (task === "FAIL") {
	console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "boom" } }));
	process.exit(1);
}
console.log("not json noise from some extension");
console.log(JSON.stringify({ type: "tool_execution_start", toolCallId: "c1", toolName: "read", args: { path: "src/app.ts" } }));
console.log(
	JSON.stringify({
		type: "message_end",
		message: { role: "assistant", provider: "fake", model: "m", content: [{ type: "text", text: JSON.stringify(echo) }], stopReason: "stop", usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 } } },
	}),
);
console.log(JSON.stringify({ type: "agent_settled", aborted: false }));
// Simulates an extension holding a handle open (lark-mcp spawning an MCP server does this).
if (task === "HANG") setInterval(() => {}, 1000);
