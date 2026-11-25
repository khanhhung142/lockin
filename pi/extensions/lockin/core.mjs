// Pure logic for the lockin pi extension. No pi imports, so `node --test` runs it directly.
// Parts of the subagent design are adapted from pi-pstack (MIT, see LICENSE-pi-pstack).
import * as fs from "node:fs";
import * as path from "node:path";

export const MAX_PARALLEL_TASKS = 8;
export const MAX_CONCURRENCY = 4;
export const MAX_RESULT_BYTES = 50 * 1024;
export const LOCKIN_ENTRY = "lockin-mode"; // session entry type; kept so pre-rename sessions resume
export const LOCKIN_STATUS = "lockin";
export const ALIASES = ["opus", "sonnet", "haiku", "fable"];

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

function unquote(value) {
	const v = value.trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
	return v;
}

function scalar(value) {
	const v = unquote(value);
	if (/^(true|yes)$/i.test(value.trim())) return true;
	if (/^(false|no)$/i.test(value.trim())) return false;
	if (value.trim().startsWith("[") && value.trim().endsWith("]")) {
		return value
			.trim()
			.slice(1, -1)
			.split(",")
			.map((item) => unquote(item))
			.filter(Boolean);
	}
	return v;
}

/**
 * Minimal YAML frontmatter reader for agent files: `key: value`, quoted values,
 * booleans, inline `[a, b]` lists, `- item` lists and `|` / `>` block scalars.
 * Returns { frontmatter: {}, body } and never throws.
 */
export function parseFrontmatter(text) {
	const normalized = String(text ?? "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
	const match = normalized.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
	if (!match) return { frontmatter: {}, body: normalized };
	const lines = match[1].split("\n");
	const frontmatter = {};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const kv = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
		if (!kv) continue;
		const [, key, raw] = kv;
		if (/^[|>][+-]?$/.test(raw.trim())) {
			const folded = raw.trim().startsWith(">");
			const block = [];
			while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === "")) block.push(lines[++i].trim());
			frontmatter[key] = block.join(folded ? " " : "\n").trim();
			continue;
		}
		if (raw.trim() === "") {
			const items = [];
			while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(unquote(lines[++i].replace(/^\s*-\s+/, "")));
			frontmatter[key] = items.length ? items : "";
			continue;
		}
		frontmatter[key] = scalar(raw);
	}
	return { frontmatter, body: normalized.slice(match[0].length) };
}

// ---------------------------------------------------------------------------
// Tools: Claude Code names -> pi names
// ---------------------------------------------------------------------------

const TOOL_MAP = {
	read: "read",
	grep: "grep",
	glob: "find",
	find: "find",
	ls: "ls",
	bash: "bash",
	edit: "edit",
	multiedit: "edit",
	notebookedit: "edit",
	write: "write",
	agent: "subagent",
	task: "subagent",
	subagent: "subagent",
};

const MUTATING_TOOLS = new Set(["edit", "write"]);

/**
 * Map a Claude Code `tools` list onto pi tool names.
 * Returns { tools: string[] | undefined, dropped: string[] }.
 * `tools` is undefined when the agent did not restrict tools.
 * mcp__* names pass through unchanged; names with no pi equivalent (WebFetch, TodoWrite, ...) are dropped.
 */
export function mapTools(list) {
	if (list === undefined || list === null || list === "") return { tools: undefined, dropped: [] };
	const items = Array.isArray(list) ? list : String(list).split(",");
	const tools = [];
	const dropped = [];
	for (const raw of items) {
		const name = String(raw).trim();
		if (!name) continue;
		const mapped = name.startsWith("mcp__") ? name : TOOL_MAP[name.toLowerCase()];
		if (!mapped) dropped.push(name);
		else if (!tools.includes(mapped)) tools.push(mapped);
	}
	return { tools, dropped };
}

/** An agent is read-only when it says so, or when it lists tools and none of them mutates files. */
export function isReadonly(frontmatterReadonly, tools) {
	if (frontmatterReadonly === true) return true;
	if (!tools) return false;
	return !tools.some((tool) => MUTATING_TOOLS.has(tool));
}

/**
 * pi CLI flags for an agent's tool restriction.
 * Explicit tool lists become a `--tools` allowlist; read-only agents without a usable list
 * get `--exclude-tools edit,write`. Bash cannot be made read-only by pi, so the prompt says so too.
 */
export function toolArgs(agent) {
	if (!agent) return [];
	if (agent.tools?.length) {
		const tools = agent.readonly ? agent.tools.filter((tool) => !MUTATING_TOOLS.has(tool)) : agent.tools;
		if (tools.length) return ["--tools", tools.join(",")];
	}
	if (agent.readonly) return ["--exclude-tools", "edit,write"];
	return [];
}

export const READONLY_NOTE =
	"You are a read-only agent. Do not create, modify or delete files, including through bash redirection, sed -i, git commands that change the tree, or any other side channel. Report findings instead.";

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/** Parse one agent markdown file. Returns undefined when it lacks a name. */
export function parseAgent(text, filePath, source) {
	const { frontmatter, body } = parseFrontmatter(text);
	const name = typeof frontmatter.name === "string" && frontmatter.name.trim() ? frontmatter.name.trim() : undefined;
	if (!name) return undefined;
	const { tools, dropped } = mapTools(frontmatter.tools);
	const model = typeof frontmatter.model === "string" && frontmatter.model.trim() ? frontmatter.model.trim() : "inherit";
	return {
		name,
		description: typeof frontmatter.description === "string" ? frontmatter.description : "",
		model,
		tools,
		droppedTools: dropped,
		readonly: isReadonly(frontmatter.readonly, tools),
		systemPrompt: body.trim(),
		source,
		filePath,
	};
}

export function loadAgentDir(directory, source) {
	let entries;
	try {
		entries = fs.readdirSync(directory, { withFileTypes: true });
	} catch {
		return [];
	}
	const agents = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (!entry.name.endsWith(".md") || (!entry.isFile() && !entry.isSymbolicLink())) continue;
		const filePath = path.join(directory, entry.name);
		try {
			const agent = parseAgent(fs.readFileSync(filePath, "utf8"), filePath, source);
			if (agent) agents.push(agent);
		} catch {
			// One broken agent file must not take the others down.
		}
	}
	return agents;
}

/** Nearest `.pi/agents` directory walking up from cwd. */
export function findProjectAgentsDir(cwd) {
	let directory = path.resolve(cwd);
	while (true) {
		const candidate = path.join(directory, ".pi", "agents");
		try {
			if (fs.statSync(candidate).isDirectory()) return candidate;
		} catch {
			// keep walking
		}
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

/**
 * Discover agents in precedence order: lockin repo, then user, then project.
 * A later source overrides an earlier agent with the same name.
 * `dirs` = { lockin, user, project } (any may be undefined); scope filters sources.
 */
export function discoverAgents(dirs, scope = "all") {
	const byName = new Map();
	const add = (list) => list.forEach((agent) => byName.set(agent.name, agent));
	if (scope !== "project" && dirs.lockin) add(loadAgentDir(dirs.lockin, "lockin"));
	if (scope !== "project" && dirs.user) add(loadAgentDir(dirs.user, "user"));
	if ((scope === "all" || scope === "project") && dirs.project) add(loadAgentDir(dirs.project, "project"));
	return [...byName.values()];
}

// ---------------------------------------------------------------------------
// Model aliases
// ---------------------------------------------------------------------------

function familyVersion(id, family) {
	const m = id.match(new RegExp(`^claude-${family}-(\\d+)(?:-(\\d{1,2}))?$`));
	return m ? [Number(m[1]), Number(m[2] ?? 0)] : undefined;
}

function newest(models, family, provider) {
	let best;
	for (const model of models) {
		if (provider && model.provider !== provider) continue;
		const version = familyVersion(model.id, family);
		if (!version) continue;
		if (!best || version[0] > best.version[0] || (version[0] === best.version[0] && version[1] > best.version[1])) {
			best = { model, version };
		}
	}
	return best ? `${best.model.provider}/${best.model.id}` : undefined;
}

/**
 * Default alias map from the models pi knows: newest claude opus/sonnet/haiku/fable,
 * preferring `provider`. fable falls back to opus, haiku to sonnet; anything still missing is "inherit".
 */
export function defaultAliases(models, provider) {
	const pick = (family) => newest(models, family, provider) ?? newest(models, family);
	const aliases = { opus: pick("opus"), sonnet: pick("sonnet"), haiku: pick("haiku"), fable: pick("fable") };
	aliases.fable ??= aliases.opus;
	aliases.haiku ??= aliases.sonnet;
	for (const key of ALIASES) aliases[key] ??= "inherit";
	return aliases;
}

export function readModelConfig(file) {
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		if (!parsed || typeof parsed.aliases !== "object" || !parsed.aliases) return undefined;
		const aliases = {};
		for (const [key, value] of Object.entries(parsed.aliases)) if (typeof value === "string") aliases[key] = value;
		return { version: 1, aliases };
	} catch {
		return undefined;
	}
}

export function writeModelConfig(file, config) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * Resolve the pi model for a child.
 * Precedence: explicit task model, then the agent's frontmatter model, then inherit.
 * Aliases go through config; "inherit" (or an alias mapped to it) means the parent model.
 * Anything else is passed to `pi --model` unchanged. Returns undefined when nothing is known.
 */
export function resolveModel({ requested, agentModel, aliases = {}, parentModel }) {
	const value = (requested ?? agentModel ?? "inherit").trim();
	const mapped = Object.hasOwn(aliases, value) ? aliases[value] : value;
	if (!mapped || mapped === "inherit") return parentModel;
	return mapped;
}

// ---------------------------------------------------------------------------
// Request shape and scheduling
// ---------------------------------------------------------------------------

/** Validate tool params and normalize to { mode, tasks }. Throws on bad input. */
export function normalizeRequest(params) {
	const single = typeof params.task === "string" && params.task.trim() !== "";
	const parallel = Array.isArray(params.tasks) && params.tasks.length > 0;
	const chain = Array.isArray(params.chain) && params.chain.length > 0;
	const modes = Number(single) + Number(parallel) + Number(chain);
	if (modes !== 1) throw new Error("Provide exactly one mode: task (single), tasks (parallel) or chain.");
	if (parallel && params.tasks.length > MAX_PARALLEL_TASKS) {
		throw new Error(`At most ${MAX_PARALLEL_TASKS} parallel tasks are allowed, got ${params.tasks.length}.`);
	}
	const list = single ? [{ agent: params.agent, task: params.task, model: params.model, cwd: params.cwd }] : parallel ? params.tasks : params.chain;
	for (const [index, task] of list.entries()) {
		if (typeof task.task !== "string" || !task.task.trim()) throw new Error(`Task ${index + 1} has an empty task.`);
	}
	return { mode: single ? "single" : parallel ? "parallel" : "chain", tasks: list };
}

/** Run callback over items with at most `limit` in flight. Results keep input order. */
export async function runLimited(items, limit, callback) {
	const results = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const index = next++;
				results[index] = await callback(items[index], index);
			}
		}),
	);
	return results;
}

export function interpolatePrevious(task, previous) {
	return task.replaceAll("{previous}", previous);
}

/**
 * Run chain steps in order, feeding each step's final text into the next step's `{previous}`.
 * `run(step, index)` resolves to a child result. Stops at the first failure.
 */
export async function runChain(steps, run) {
	const results = [];
	let previous = "";
	for (const [index, step] of steps.entries()) {
		const result = await run({ ...step, task: interpolatePrevious(step.task, previous) }, index);
		results.push(result);
		if (isFailure(result)) return { results, failedAt: index };
		previous = finalText(result);
	}
	return { results, failedAt: undefined };
}

// ---------------------------------------------------------------------------
// Child results
// ---------------------------------------------------------------------------

export function emptyUsage() {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

export function addUsage(total, usage) {
	if (!usage) return total;
	for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]) total[key] += usage[key] ?? 0;
	for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"]) total.cost[key] += usage.cost?.[key] ?? 0;
	return total;
}

/** Fold one `pi --mode json` stdout line into a child result. Ignores non-JSON noise. */
export function applyEventLine(result, line) {
	if (!line.trim()) return false;
	let event;
	try {
		event = JSON.parse(line);
	} catch {
		return false;
	}
	// agent_settled is the last event of a print run. Extensions that keep handles open
	// (e.g. a spawned MCP server) can stop the child from exiting, so the runner stops it.
	if (event?.type === "agent_settled") {
		result.settled = true;
		return false;
	}
	if (event?.type === "tool_execution_start") {
		result.toolUses = (result.toolUses ?? 0) + 1;
		result.activity = describeTool(event.toolName, event.args);
		return true;
	}
	if (event?.type !== "message_end" || event.message?.role !== "assistant") return false;
	const message = event.message;
	result.turns += 1;
	addUsage(result.usage, message.usage);
	if (message.usage?.totalTokens) result.contextTokens = message.usage.totalTokens;
	result.stopReason = message.stopReason;
	result.errorMessage = message.errorMessage;
	if (message.model) result.model = message.provider ? `${message.provider}/${message.model}` : message.model;
	const text = (Array.isArray(message.content) ? message.content : [])
		.filter((part) => part?.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
	if (text) {
		result.text = text;
		result.activity = text.split("\n").find((line) => line.trim())?.trim().slice(0, 80);
	}
	return true;
}

// ---------------------------------------------------------------------------
// Live progress display (Claude Code-style: activity + tool uses · tokens · time)
// ---------------------------------------------------------------------------

/** One-line summary of a tool call: `read src/a.ts`, `bash: go test ./x`. */
export function describeTool(name, args) {
	const a = args ?? {};
	const key = a.path ?? a.file_path ?? a.command ?? a.pattern ?? a.query ?? a.url ?? a.task;
	const detail = typeof key === "string" ? key.replace(/\s+/g, " ").trim() : "";
	const line = detail ? `${name}${a.command ? ":" : ""} ${detail}` : String(name);
	return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

export function formatTokens(n) {
	if (!n) return "0";
	return n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
}

export function formatDuration(ms) {
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** `3 tool uses · 12.4k tokens · 1m 5s`; tokens = the child's latest context size. */
export function statsLine(r, now = Date.now()) {
	const uses = r.toolUses ?? 0;
	const end = r.endedAt ?? now;
	const parts = [`${uses} tool use${uses === 1 ? "" : "s"}`, `${formatTokens(r.contextTokens ?? 0)} tokens`];
	if (r.startedAt != null) parts.push(formatDuration(end - r.startedAt));
	return parts.join(" · ");
}

export function finalText(result) {
	return result.text || result.errorMessage || result.stderr?.trim() || "(no output)";
}

export function isFailure(result) {
	return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted" || Boolean(result.errorMessage && !result.text);
}

export function truncate(text, limit = MAX_RESULT_BYTES) {
	if (Buffer.byteLength(text) <= limit) return text;
	let output = text.slice(0, limit);
	while (Buffer.byteLength(output) > limit) output = output.slice(0, -1);
	return `${output}\n\n[Output truncated at ${limit} bytes.]`;
}

// ---------------------------------------------------------------------------
// Lockin mode
// ---------------------------------------------------------------------------

/** `/lockin off|disable|stop` turns off; anything else turns on with that text as the task. */
export function parseLockinArgs(args) {
	const text = String(args ?? "").trim();
	if (/^(off|disable|stop)$/i.test(text)) return { action: "off" };
	return { action: "on", task: text };
}

/** Last lockin entry on the branch wins. */
export function lockinFromEntries(entries) {
	let enabled = false;
	for (const entry of entries ?? []) {
		if (entry?.type === "custom" && entry.customType === LOCKIN_ENTRY) enabled = Boolean(entry.data?.enabled);
	}
	return enabled;
}

export function reminderText(skillPath) {
	return `LOCKIN MODE ACTIVE. Route this message per the lockin skill (${skillPath}): classify, log, follow the playbook or /grind, todo first.`;
}

export function activationText(skillPath) {
	return `Lockin mode was just turned on for this session. Before doing anything else, use the read tool to load ${skillPath} in full; it defines the lockin workflow you must follow from now on.`;
}

/**
 * Text to inject before a user-started run, or undefined.
 * `state` = { enabled, pendingActivation }; only runs started by a user message get it.
 */
export function injectionFor(state, messageType, skillPath) {
	if (!state.enabled || messageType !== "user") return undefined;
	const parts = [];
	if (state.pendingActivation) parts.push(activationText(skillPath));
	parts.push(reminderText(skillPath));
	return parts.join("\n\n");
}
