// Stub-harness tests for index.ts: a fake ExtensionAPI plus fixtures/fake-pi.mjs as the child process.
// Run: node --test index.test.mjs
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const here = path.dirname(new URL(import.meta.url).pathname);
// pi's own dependencies: the managed install (~/.pi/agent/install/releases/<version>/node_modules,
// flat) or a global npm install (<node prefix>/lib/node_modules/@earendil-works/pi-coding-agent/node_modules).
function findPiModules() {
	const candidates = [];
	try {
		const root = path.join(os.homedir(), ".pi", "agent", "install");
		const version = fs.readFileSync(path.join(root, "current-version"), "utf8").trim();
		candidates.push(path.join(root, "releases", version, "node_modules"));
	} catch {}
	candidates.push(path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "@earendil-works", "pi-coding-agent", "node_modules"));
	const found = candidates.find((dir) => fs.existsSync(path.join(dir, "typebox")));
	if (!found) throw new Error(`pi dependencies not found; looked in:\n${candidates.join("\n")}`);
	return found;
}
const piModules = findPiModules();
registerHooks({
	resolve(specifier, context, next) {
		if (specifier === "typebox") return next(pathToFileURL(path.join(piModules, "typebox", "build", "index.mjs")).href, context);
		if (specifier === "@earendil-works/pi-tui") return next(pathToFileURL(path.join(piModules, "@earendil-works", "pi-tui", "dist", "index.js")).href, context);
		return next(specifier, context);
	},
});

// Isolate ~/.pi/agent/agents and ~/.agents/lockin/models.json.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "lockin-home-"));
process.env.HOME = home;
const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockin-fakepi-"));
process.env.FAKE_PI_DIR = fakeDir;

const ext = await import(path.join(here, "index.ts"));

function harness() {
	const h = { handlers: {}, tools: {}, commands: {}, entries: [], sent: [], status: {}, notes: [] };
	ext.default({
		on: (name, fn) => (h.handlers[name] = fn),
		registerTool: (tool) => (h.tools[tool.name] = tool),
		registerCommand: (name, cmd) => (h.commands[name] = cmd),
		appendEntry: (customType, data) => h.entries.push({ type: "custom", customType, data }),
		sendUserMessage: (text, opts) => h.sent.push({ text, opts }),
	});
	h.ctx = (extra = {}) => ({
		hasUI: true,
		cwd: extra.cwd ?? home,
		model: { provider: "parentprov", id: "parent-model" },
		modelRegistry: { getAvailable: () => [{ provider: "anthropic", id: "claude-opus-5-5" }, { provider: "anthropic", id: "claude-sonnet-5" }] },
		sessionManager: { getBranch: () => extra.branch ?? h.entries },
		isIdle: () => true,
		ui: { setStatus: (k, v) => (h.status[k] = v), notify: (m) => h.notes.push(m), confirm: async () => extra.confirm ?? true },
		...extra,
	});
	return h;
}

test("registers subagent tool, lockin command and the needed events", () => {
	const h = harness();
	assert.ok(h.tools.subagent);
	assert.ok(h.commands["lockin"]);
	for (const e of ["session_start", "input", "before_agent_start"]) assert.equal(typeof h.handlers[e], "function");
	assert.equal(h.handlers.tool_call, undefined, "no guard duplication: guards.ts owns tool_call guards");
});

test("lockin mode: on with task, sticky reminder, off", async () => {
	const h = harness();
	const ctx = h.ctx();
	h.handlers.session_start({}, ctx);
	assert.equal(h.handlers.before_agent_start({ messageType: "user", prompt: "hi" }), undefined);

	await h.commands["lockin"].handler("fix the login bug", ctx);
	assert.deepEqual(h.entries.at(-1).data, { enabled: true });
	assert.deepEqual(h.sent, [{ text: "fix the login bug", opts: undefined }]);
	assert.equal(h.status.lockin, "lockin");

	const first = h.handlers.before_agent_start({ messageType: "user", prompt: "fix the login bug" });
	assert.equal(first.message.customType, "lockin-reminder");
	assert.equal(first.message.display, false);
	assert.match(first.message.content, /use the read tool to load .*skills\/lockin\/SKILL\.md/);
	assert.match(first.message.content, /LOCKIN MODE ACTIVE/);

	const second = h.handlers.before_agent_start({ messageType: "user", prompt: "next" });
	assert.doesNotMatch(second.message.content, /just turned on/);
	assert.match(second.message.content, /^LOCKIN MODE ACTIVE\. Route this message per the lockin skill \(.*SKILL\.md\): classify, log, follow the playbook or \/grind, todo first\.$/);
	assert.equal(h.handlers.before_agent_start({ messageType: "custom", message: {} }), undefined);

	// Re-running /lockin while on does not ask for another skill read.
	await h.commands["lockin"].handler("another task", ctx);
	assert.doesNotMatch(h.handlers.before_agent_start({ messageType: "user" }).message.content, /just turned on/);

	await h.commands["lockin"].handler("off", ctx);
	assert.deepEqual(h.entries.at(-1).data, { enabled: false });
	assert.equal(h.status.lockin, undefined);
	assert.equal(h.handlers.before_agent_start({ messageType: "user", prompt: "x" }), undefined);
});

test("lockin mode: no task just arms it; resume restores it; busy agent gets followUp", async () => {
	const h = harness();
	const ctx = h.ctx();
	await h.commands["lockin"].handler("", ctx);
	assert.equal(h.sent.length, 0);
	assert.match(h.notes.at(-1), /Lockin mode on/);

	const resumed = harness();
	resumed.handlers.session_start({}, resumed.ctx({ branch: [{ type: "custom", customType: "lockin-mode", data: { enabled: true } }] }));
	assert.equal(resumed.status.lockin, "lockin");
	assert.match(resumed.handlers.before_agent_start({ messageType: "user" }).message.content, /just turned on/);

	const busy = harness();
	await busy.commands["lockin"].handler("task while busy", busy.ctx({ isIdle: () => false }));
	assert.deepEqual(busy.sent[0].opts, { deliverAs: "followUp" });

	const viaSkill = harness();
	viaSkill.handlers.input({ text: "/skill:lockin do x" }, viaSkill.ctx());
	const injected = viaSkill.handlers.before_agent_start({ messageType: "user" }).message.content;
	assert.doesNotMatch(injected, /just turned on/, "skill command already loads the skill");
	assert.match(injected, /LOCKIN MODE ACTIVE/);
});

// ---------------------------------------------------------------- subagent, via fake pi children
function setupProject() {
	const repo = fs.mkdtempSync(path.join(os.tmpdir(), "lockin-repo-"));
	const agents = path.join(repo, ".pi", "agents");
	fs.mkdirSync(agents, { recursive: true });
	fs.writeFileSync(path.join(agents, "scout.md"), "---\nname: scout\ndescription: reads\nmodel: sonnet\ntools: Read, Grep, Glob\n---\nYou scout.\n");
	fs.writeFileSync(path.join(agents, "builder.md"), "---\nname: builder\ndescription: builds\nmodel: fable\n---\nYou build.\n");
	fs.mkdirSync(path.join(repo, "wt"));
	return repo;
}

async function run(h, params, ctx) {
	const original = process.argv[1];
	process.argv[1] = path.join(here, "fixtures", "fake-pi.mjs");
	try {
		return await h.tools.subagent.execute("id", params, undefined, () => {}, ctx);
	} finally {
		process.argv[1] = original;
	}
}

test("subagent single: agent prompt, read-only tools, alias model, config created", async () => {
	const h = harness();
	const repo = setupProject();
	const ctx = h.ctx({ cwd: repo, hasUI: false });
	const res = await run(h, { agent: "scout", task: "look around", confirmProjectAgents: false }, ctx);
	const echo = JSON.parse(res.content[0].text);
	assert.equal(echo.task, "look around");
	assert.equal(echo.model, "anthropic/claude-sonnet-5");
	assert.equal(echo.tools, "read,grep,find");
	assert.match(echo.prompt, /^You scout\.\n\nYou are a read-only agent/);
	assert.equal(echo.depth, "1");
	assert.equal(res.usage.totalTokens, 12);
	const cfg = JSON.parse(fs.readFileSync(path.join(home, ".agents", "lockin", "models.json"), "utf8"));
	assert.equal(cfg.aliases.fable, "anthropic/claude-opus-5-5", "no fable model known: falls back to opus");
});

test("subagent: no agent inherits parent model; per-task cwd", async () => {
	const h = harness();
	const repo = setupProject();
	const res = await run(h, { task: "plain", cwd: "wt" }, h.ctx({ cwd: repo }));
	const echo = JSON.parse(res.content[0].text);
	assert.equal(echo.model, "parentprov/parent-model");
	assert.equal(echo.prompt, null);
	assert.equal(fs.realpathSync(echo.cwd), fs.realpathSync(path.join(repo, "wt")));
});

test("subagent parallel: 8 tasks, max 4 concurrent, 9 rejected", async () => {
	const h = harness();
	const repo = setupProject();
	fs.rmSync(path.join(fakeDir, "peaks"), { force: true });
	const tasks = Array.from({ length: 8 }, (_, i) => ({ task: `t${i}` }));
	const res = await run(h, { tasks }, h.ctx({ cwd: repo }));
	assert.equal((res.content[0].text.match(/completed/g) ?? []).length, 8);
	const peak = Math.max(...fs.readFileSync(path.join(fakeDir, "peaks"), "utf8").trim().split("\n").map(Number));
	assert.ok(peak <= 4 && peak >= 2, `peak concurrency ${peak}`);
	await assert.rejects(run(h, { tasks: [...tasks, { task: "t8" }] }, h.ctx({ cwd: repo })), /At most 8/);
});

test("subagent chain: {previous} carries the prior final output; failure stops the chain", async () => {
	const h = harness();
	const repo = setupProject();
	const res = await run(h, { chain: [{ task: "step one" }, { task: "got: {previous}" }] }, h.ctx({ cwd: repo }));
	const last = JSON.parse(res.content[0].text);
	assert.equal(JSON.parse(last.task.slice("got: ".length)).task, "step one");

	const failed = await run(h, { chain: [{ task: "FAIL" }, { task: "never" }] }, h.ctx({ cwd: repo }));
	assert.equal(failed.isError, true);
	assert.match(failed.content[0].text, /Chain step 1 .* failed: boom/);
	assert.equal(failed.details.results.length, 1);
});

test("subagent: project agents need trust; unknown agent lists available", async () => {
	const h = harness();
	const repo = setupProject();
	await assert.rejects(run(h, { agent: "scout", task: "x" }, h.ctx({ cwd: repo, hasUI: false })), /need confirmation/);
	await assert.rejects(run(h, { agent: "scout", task: "x" }, h.ctx({ cwd: repo, confirm: false })), /not approved/);
	const ok = await run(h, { agent: "builder", task: "x" }, h.ctx({ cwd: repo, confirm: true }));
	assert.equal(JSON.parse(ok.content[0].text).model, "anthropic/claude-opus-5-5");
	await assert.rejects(run(h, { agent: "nope", task: "x" }, h.ctx({ cwd: repo })), /Unknown agent\(s\): nope\. Available: .*scout/);
});

test("subagent: a child that never exits after agent_settled is stopped and counts as success", async () => {
	const h = harness();
	const started = Date.now();
	const res = await run(h, { task: "HANG" }, h.ctx({ cwd: setupProject() }));
	assert.equal(res.isError, undefined);
	assert.equal(JSON.parse(res.content[0].text).task, "HANG");
	assert.equal(res.details.results[0].exitCode, 0);
	assert.ok(Date.now() - started < 6000);
});

test("subagent live view: running updates carry stats, renderers draw Claude Code-style rows", async () => {
	const h = harness();
	const updates = [];
	const original = process.argv[1];
	process.argv[1] = path.join(here, "fixtures", "fake-pi.mjs");
	let res;
	try {
		res = await h.tools.subagent.execute("id", { task: "look around" }, undefined, (u) => updates.push(u), h.ctx({ hasUI: false }));
	} finally {
		process.argv[1] = original;
	}
	const live = updates.map((u) => u.details).find((d) => d?.running && d.results[0]?.toolUses === 1);
	assert.ok(live, "a running update reports the tool use");
	assert.equal(live.results[0].activity, "read src/app.ts");

	const theme = { fg: (_c, s) => s, bold: (s) => s };
	const draw = (c) => c.render(200).join("\n").replace(/ +$/gm, "");
	assert.match(draw(h.tools.subagent.renderCall({ task: "look around\nmore" }, theme)), /Subagent\(pi\) look around$/);
	assert.match(draw(h.tools.subagent.renderResult({ details: live }, { expanded: false }, theme, { args: {} })), /⎿  read src\/app\.ts\n\s+1 tool use · 0 tokens · \d+s/);
	const done = draw(h.tools.subagent.renderResult(res, { expanded: false }, theme, { args: {} }));
	assert.match(done, /⎿  Done \(1 tool use · 12 tokens · \d+s\)/);
	assert.match(done, /ctrl\+o to expand/);
	assert.match(draw(h.tools.subagent.renderResult(res, { expanded: true }, theme, { args: {} })), /"task":"look around"/);
});
