// Run: node --test core.test.mjs
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import * as core from "./core.mjs";

test("frontmatter: Claude Code agent with comma tools and Cursor keys", () => {
	const text = `---
name: reviewer
description: "Reviews code: finds bugs"
model: sonnet
tools: Read, Grep, Glob, Bash
readonly: true
is_background: false
---
You review code.
`;
	const agent = core.parseAgent(text, "/x/reviewer.md", "lockin");
	assert.equal(agent.name, "reviewer");
	assert.equal(agent.description, "Reviews code: finds bugs");
	assert.equal(agent.model, "sonnet");
	assert.deepEqual(agent.tools, ["read", "grep", "find", "bash"]);
	assert.equal(agent.readonly, true);
	assert.equal(agent.systemPrompt, "You review code.");
});

test("frontmatter: missing model means inherit, no tools means unrestricted", () => {
	const agent = core.parseAgent("---\nname: worker\ndescription: does work\n---\nBody", "f", "user");
	assert.equal(agent.model, "inherit");
	assert.equal(agent.tools, undefined);
	assert.equal(agent.readonly, false);
	assert.deepEqual(core.toolArgs(agent), []);
});

test("frontmatter: CRLF, block scalar description, YAML list tools, inline list", () => {
	const crlf = "---\r\nname: a\r\ndescription: >\r\n  line one\r\n  line two\r\nmodel: 'opus'\r\ntools:\r\n  - Read\r\n  - Edit\r\n---\r\nhi\r\n";
	const a = core.parseAgent(crlf, "f", "user");
	assert.equal(a.description, "line one line two");
	assert.equal(a.model, "opus");
	assert.deepEqual(a.tools, ["read", "edit"]);
	assert.equal(a.readonly, false);
	const b = core.parseAgent("---\nname: b\ntools: [Read, WebFetch, mcp__lark__x]\n---\n", "f", "user");
	assert.deepEqual(b.tools, ["read", "mcp__lark__x"]);
	assert.deepEqual(b.droppedTools, ["WebFetch"]);
});

test("frontmatter: no name or no frontmatter is skipped, garbage never throws", () => {
	assert.equal(core.parseAgent("---\ndescription: x\n---\n", "f", "user"), undefined);
	assert.equal(core.parseAgent("just markdown", "f", "user"), undefined);
	assert.deepEqual(core.parseFrontmatter(undefined).frontmatter, {});
});

test("tools: read-only inferred from a list without Edit/Write, and tool args", () => {
	assert.equal(core.isReadonly(undefined, ["read", "grep"]), true);
	assert.equal(core.isReadonly(undefined, ["read", "write"]), false);
	assert.deepEqual(core.toolArgs({ tools: ["read", "grep"], readonly: true }), ["--tools", "read,grep"]);
	// readonly: true wins over a list that includes Edit
	assert.deepEqual(core.toolArgs({ tools: ["read", "edit"], readonly: true }), ["--tools", "read"]);
	assert.deepEqual(core.toolArgs({ tools: undefined, readonly: true }), ["--exclude-tools", "edit,write"]);
	assert.deepEqual(core.toolArgs({ tools: ["read", "edit", "write", "bash"], readonly: false }), ["--tools", "read,edit,write,bash"]);
});

test("discovery: lockin < user < project precedence, scope filter", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "lockin-agents-"));
	const mk = (dir, name, desc) => {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, `${name}.md`), `---\nname: ${name}\ndescription: ${desc}\n---\n`);
	};
	const dirs = { lockin: path.join(root, "l"), user: path.join(root, "u"), project: path.join(root, "repo", ".pi", "agents") };
	mk(dirs.lockin, "a", "from lockin");
	mk(dirs.user, "a", "from user");
	mk(dirs.user, "b", "user b");
	mk(dirs.project, "b", "project b");
	fs.writeFileSync(path.join(dirs.lockin, "notes.txt"), "ignored");
	const all = Object.fromEntries(core.discoverAgents(dirs, "all").map((a) => [a.name, a.description]));
	assert.deepEqual(all, { a: "from user", b: "project b" });
	const user = Object.fromEntries(core.discoverAgents(dirs, "user").map((a) => [a.name, a.description]));
	assert.deepEqual(user, { a: "from user", b: "user b" });
	fs.mkdirSync(path.join(root, "repo", "src", "deep"), { recursive: true });
	assert.equal(core.findProjectAgentsDir(path.join(root, "repo", "src", "deep")), dirs.project);
	assert.deepEqual(core.loadAgentDir(path.join(root, "missing"), "user"), []);
});

test("aliases: newest per family, provider preference, fable and haiku fallbacks", () => {
	const ids = ["claude-opus-4-8", "claude-opus-5", "claude-opus-5-5", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-haiku-5-5", "claude-fable-5", "claude-fable-5-1"];
	const models = [...ids.map((id) => ({ provider: "anthropic", id })), { provider: "other", id: "claude-opus-9" }];
	assert.deepEqual(core.defaultAliases(models, "anthropic"), {
		opus: "anthropic/claude-opus-5-5",
		sonnet: "anthropic/claude-sonnet-5",
		haiku: "anthropic/claude-haiku-5-5",
		fable: "anthropic/claude-fable-5-1",
	});
	const noFable = core.defaultAliases([{ provider: "p", id: "claude-opus-4-7" }, { provider: "p", id: "claude-sonnet-4-6" }], "p");
	assert.equal(noFable.fable, "p/claude-opus-4-7");
	assert.equal(noFable.haiku, "p/claude-sonnet-4-6");
	assert.deepEqual(core.defaultAliases([], "p"), { opus: "inherit", sonnet: "inherit", haiku: "inherit", fable: "inherit" });
});

test("aliases: resolveModel precedence and inherit", () => {
	const aliases = { opus: "anthropic/claude-opus-5-5", sonnet: "anthropic/claude-sonnet-5", haiku: "inherit" };
	const parentModel = "deepseek/deepseek-flash";
	assert.equal(core.resolveModel({ agentModel: "opus", aliases, parentModel }), "anthropic/claude-opus-5-5");
	assert.equal(core.resolveModel({ requested: "sonnet", agentModel: "opus", aliases, parentModel }), "anthropic/claude-sonnet-5");
	assert.equal(core.resolveModel({ agentModel: "inherit", aliases, parentModel }), parentModel);
	assert.equal(core.resolveModel({ aliases, parentModel }), parentModel);
	assert.equal(core.resolveModel({ agentModel: "haiku", aliases, parentModel }), parentModel);
	assert.equal(core.resolveModel({ requested: "openai/gpt-x", aliases, parentModel }), "openai/gpt-x");
	assert.equal(core.resolveModel({ agentModel: "inherit", aliases }), undefined);
});

test("config: read/write round trip, invalid file returns undefined", () => {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lockin-cfg-")), "sub", "models.json");
	assert.equal(core.readModelConfig(file), undefined);
	core.writeModelConfig(file, { version: 1, aliases: { opus: "a/b" } });
	assert.deepEqual(core.readModelConfig(file), { version: 1, aliases: { opus: "a/b" } });
	fs.writeFileSync(file, "{nope");
	assert.equal(core.readModelConfig(file), undefined);
});

test("request: exactly one mode, parallel cap of 8, empty task rejected", () => {
	assert.equal(core.normalizeRequest({ task: "x" }).mode, "single");
	assert.equal(core.normalizeRequest({ tasks: [{ task: "a" }] }).mode, "parallel");
	assert.equal(core.normalizeRequest({ chain: [{ task: "a" }] }).mode, "chain");
	assert.throws(() => core.normalizeRequest({}), /exactly one mode/);
	assert.throws(() => core.normalizeRequest({ task: "x", tasks: [{ task: "y" }] }), /exactly one mode/);
	const nine = Array.from({ length: 9 }, (_, i) => ({ task: `t${i}` }));
	assert.throws(() => core.normalizeRequest({ tasks: nine }), /At most 8/);
	assert.equal(core.normalizeRequest({ tasks: nine.slice(0, 8) }).tasks.length, 8);
	assert.throws(() => core.normalizeRequest({ chain: [{ task: "a" }, { task: " " }] }), /Task 2 has an empty task/);
});

test("runLimited: never more than 4 in flight, keeps order", async () => {
	let inFlight = 0;
	let peak = 0;
	const out = await core.runLimited([1, 2, 3, 4, 5, 6, 7, 8], core.MAX_CONCURRENCY, async (n) => {
		inFlight++;
		peak = Math.max(peak, inFlight);
		await new Promise((r) => setTimeout(r, 10 + (n % 3) * 5));
		inFlight--;
		return n * 10;
	});
	assert.equal(peak, 4);
	assert.deepEqual(out, [10, 20, 30, 40, 50, 60, 70, 80]);
});

test("chain: {previous} interpolation and stop on failure", async () => {
	const seen = [];
	const ok = (text) => ({ exitCode: 0, text });
	const { results, failedAt } = await core.runChain(
		[{ task: "first" }, { task: "second got [{previous}]" }, { task: "third {previous} {previous}" }],
		async (step) => {
			seen.push(step.task);
			return ok(`out(${step.task})`);
		},
	);
	assert.equal(failedAt, undefined);
	assert.deepEqual(seen, ["first", "second got [out(first)]", "third out(second got [out(first)]) out(second got [out(first)])"]);
	assert.equal(results.length, 3);

	const calls = [];
	const failed = await core.runChain([{ task: "a" }, { task: "b" }, { task: "c" }], async (step, i) => {
		calls.push(step.task);
		return i === 1 ? { exitCode: 1, stderr: "bad" } : ok("fine");
	});
	assert.equal(failed.failedAt, 1);
	assert.deepEqual(calls, ["a", "b"]);
});

test("child events: final assistant text, usage sum, error without text is failure", () => {
	const r = { exitCode: 0, turns: 0, usage: core.emptyUsage(), stderr: "" };
	assert.equal(core.applyEventLine(r, "garbage"), false);
	assert.equal(core.applyEventLine(r, JSON.stringify({ type: "message_end", message: { role: "user", content: "x" } })), false);
	const msg = (text, extra = {}) => JSON.stringify({ type: "message_end", message: { role: "assistant", provider: "p", model: "m", content: text ? [{ type: "text", text }] : [{ type: "toolCall" }], usage: { input: 3, output: 1, totalTokens: 4, cost: { total: 0.5 } }, stopReason: "stop", ...extra } });
	core.applyEventLine(r, msg("thinking out loud"));
	core.applyEventLine(r, msg(""));
	core.applyEventLine(r, msg("final answer"));
	assert.equal(core.finalText(r), "final answer");
	assert.equal(r.turns, 3);
	assert.equal(r.usage.input, 9);
	assert.equal(r.usage.cost.total, 1.5);
	assert.equal(r.model, "p/m");
	assert.equal(core.isFailure(r), false);

	const e = { exitCode: 0, turns: 0, usage: core.emptyUsage(), stderr: "" };
	core.applyEventLine(e, JSON.stringify({ type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "403 Insufficient account balance" } }));
	assert.equal(core.isFailure(e), true);
	assert.equal(core.finalText(e), "403 Insufficient account balance");
});

test("live progress: tool events set activity, stats line reads like Claude Code", () => {
	const r = { exitCode: 0, turns: 0, usage: core.emptyUsage(), stderr: "", startedAt: 0 };
	assert.equal(core.applyEventLine(r, JSON.stringify({ type: "tool_execution_start", toolName: "bash", args: { command: "go  test ./x" } })), true);
	assert.equal(r.activity, "bash: go test ./x");
	core.applyEventLine(r, JSON.stringify({ type: "tool_execution_start", toolName: "read", args: { path: "a.ts" } }));
	assert.equal(r.activity, "read a.ts");
	core.applyEventLine(r, JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "\nFound it.\nmore" }], usage: { totalTokens: 12_400 } } }));
	assert.equal(r.activity, "Found it.");
	assert.equal(core.statsLine(r, 65_000), "2 tool uses · 12k tokens · 1m 5s");
	r.endedAt = 3_000;
	assert.equal(core.statsLine({ ...r, toolUses: 1, contextTokens: 999 }, 99_999), "1 tool use · 999 tokens · 3s");
	assert.equal(core.formatTokens(1_250), "1.3k");
	assert.equal(core.formatTokens(0), "0");
	assert.equal(core.formatDuration(3_725_000), "1h 2m");
	assert.equal(core.describeTool("grep", { pattern: "x".repeat(100) }).length, 80);
	assert.equal(core.describeTool("todo", {}), "todo");
});

test("truncate: byte limit with marker", () => {
	assert.equal(core.truncate("short", 100), "short");
	const t = core.truncate("é".repeat(100), 51);
	assert.ok(Buffer.byteLength(t.split("\n\n[")[0]) <= 51 && t.includes("[Output truncated"));
});

test("lockin: args, entries, injection", () => {
	assert.deepEqual(core.parseLockinArgs(" off "), { action: "off" });
	assert.deepEqual(core.parseLockinArgs("STOP"), { action: "off" });
	assert.deepEqual(core.parseLockinArgs(""), { action: "on", task: "" });
	assert.deepEqual(core.parseLockinArgs("fix the login bug"), { action: "on", task: "fix the login bug" });
	const entry = (enabled) => ({ type: "custom", customType: core.LOCKIN_ENTRY, data: { enabled } });
	assert.equal(core.lockinFromEntries([]), false);
	assert.equal(core.lockinFromEntries([entry(true), { type: "message" }]), true);
	assert.equal(core.lockinFromEntries([entry(true), entry(false)]), false);
	const skill = "/repo/skills/lockin/SKILL.md";
	assert.equal(core.injectionFor({ enabled: false }, "user", skill), undefined);
	assert.equal(core.injectionFor({ enabled: true }, "custom", skill), undefined);
	assert.equal(
		core.injectionFor({ enabled: true, pendingActivation: false }, "user", skill),
		`LOCKIN MODE ACTIVE. Route this message per the lockin skill (${skill}): classify, log, follow the playbook or /grind, todo first.`,
	);
	const first = core.injectionFor({ enabled: true, pendingActivation: true }, "user", skill);
	assert.match(first, /^Lockin mode was just turned on/);
	assert.match(first, /use the read tool to load \/repo\/skills\/lockin\/SKILL.md/);
	assert.match(first, /LOCKIN MODE ACTIVE/);
});
