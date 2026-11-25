/**
 * lockin - pi extension for the lockin skill pack.
 *
 * - `subagent` tool: runs each child as a separate `pi --mode json --print --no-session`
 *   process and returns only the child's final text. Single, parallel (max 8, 4 at once)
 *   and chain (`{previous}`) modes. Agents are markdown files from <repo>/agents,
 *   ~/.pi/agent/agents and the nearest project .pi/agents (later wins).
 *   Claude Code model aliases map through ~/.agents/lockin/models.json.
 *   Live view like Claude Code's Task tool: per child the current activity plus
 *   `N tool uses · Xk tokens · elapsed`, ticking every second; ctrl+o expands final output.
 * - `/lockin [task]` / `/lockin off`: sticky mode that injects a routing reminder
 *   into every user-started run (before_agent_start) and shows a footer status.
 *
 * Guards (test_guard, mr_guard) live in ../guards.ts, not here.
 * The subagent runner is adapted from pi-pstack (MIT, see LICENSE-pi-pstack).
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
// @ts-ignore -- plain .mjs core, no types needed
import * as core from "./core.mjs";

const REPO_ROOT = path.resolve(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))), "../../..");
const LOCKIN_AGENTS_DIR = path.join(REPO_ROOT, "agents");
const SKILL_PATH = path.join(REPO_ROOT, "skills", "lockin", "SKILL.md");
const USER_AGENTS_DIR = path.join(os.homedir(), ".pi", "agent", "agents");
const MODELS_CONFIG = path.join(os.homedir(), ".agents", "lockin", "models.json");
const DEPTH_ENV = "LOCKIN_SUBAGENT_DEPTH";
const MAX_DEPTH = 3;
// How long a child may linger after agent_settled before it is stopped.
const SETTLE_GRACE_MS = 2_000;

const TaskSchema = Type.Object({
	agent: Type.Optional(Type.String()),
	task: Type.String({ description: "Self-contained; point to files rather than inlining big payloads." }),
	model: Type.Optional(Type.String({ description: "opus|sonnet|haiku|fable|inherit or provider/id" })),
	cwd: Type.Optional(Type.String()),
});

const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String()),
	task: Type.Optional(Type.String()),
	model: Type.Optional(Type.String({ description: "opus|sonnet|haiku|fable|inherit or provider/id" })),
	cwd: Type.Optional(Type.String()),
	tasks: Type.Optional(Type.Array(TaskSchema)),
	chain: Type.Optional(Type.Array(TaskSchema)),
	agentScope: Type.Optional(Type.Union([Type.Literal("user"), Type.Literal("project"), Type.Literal("all")], { description: "default all; project overrides user" })),
	confirmProjectAgents: Type.Optional(Type.Boolean({ description: "default true; false only for trusted repos without UI" })),
});

type ChildResult = {
	agent: string;
	source: string;
	task: string;
	cwd: string;
	model?: string;
	exitCode: number;
	turns: number;
	usage: ReturnType<typeof core.emptyUsage>;
	text?: string;
	stopReason?: string;
	errorMessage?: string;
	settled?: boolean;
	stderr: string;
	startedAt?: number;
	endedAt?: number;
	toolUses?: number;
	contextTokens?: number;
	activity?: string;
};

function piInvocation(args: string[]): { command: string; args: string[] } {
	const script = process.argv[1];
	if (script && fs.existsSync(script) && !script.startsWith("/$bunfs/root/")) return { command: process.execPath, args: [script, ...args] };
	const executable = path.basename(process.execPath).toLowerCase();
	return /^(node|bun)(\.exe)?$/.test(executable) ? { command: "pi", args } : { command: process.execPath, args };
}

function parentModel(ctx: ExtensionContext): string | undefined {
	return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
}

/** Read alias config; create it from the models pi knows when missing. */
function loadAliases(ctx: ExtensionContext): Record<string, string> {
	const existing = core.readModelConfig(MODELS_CONFIG);
	if (existing) return existing.aliases;
	const models = ctx.modelRegistry.getAvailable().map((model) => ({ provider: model.provider, id: model.id }));
	const aliases = core.defaultAliases(models, ctx.model?.provider ?? "anthropic");
	if (!fs.existsSync(MODELS_CONFIG)) {
		try {
			core.writeModelConfig(MODELS_CONFIG, { version: 1, aliases });
		} catch {
			// Config is a convenience; fall back to the computed map.
		}
	}
	return aliases;
}

async function runChild(
	agent: any | undefined,
	task: { agent?: string; task: string; cwd?: string },
	model: string | undefined,
	parentCwd: string,
	signal: AbortSignal | undefined,
	onProgress: (result: ChildResult) => void,
): Promise<ChildResult> {
	const cwd = task.cwd ? path.resolve(parentCwd, task.cwd) : parentCwd;
	const result: ChildResult = {
		agent: agent?.name ?? task.agent ?? "(default)",
		source: agent?.source ?? "none",
		task: task.task,
		cwd,
		model,
		exitCode: 0,
		turns: 0,
		usage: core.emptyUsage(),
		stderr: "",
		startedAt: Date.now(),
	};
	if (task.agent && !agent) {
		result.exitCode = 1;
		result.errorMessage = `Unknown agent ${JSON.stringify(task.agent)}.`;
		return result;
	}
	if (!fs.existsSync(cwd)) {
		result.exitCode = 1;
		result.errorMessage = `cwd does not exist: ${cwd}`;
		return result;
	}

	let tempDir: string | undefined;
	try {
		const args = ["--mode", "json", "--print", "--no-session"];
		if (agent) {
			const prompt = [agent.systemPrompt, agent.readonly ? core.READONLY_NOTE : ""].filter(Boolean).join("\n\n");
			if (prompt) {
				tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pi-lockin-agent-"));
				const file = path.join(tempDir, `${agent.name.replace(/[^a-z0-9_.-]/gi, "_")}.md`);
				await fsp.writeFile(file, prompt, { encoding: "utf8", mode: 0o600 });
				args.push("--append-system-prompt", file);
			}
			args.push(...core.toolArgs(agent));
		}
		if (model) args.push("--model", model);
		args.push("--", task.task);

		onProgress(result); // show the row (starting…, clock running) before the first child event
		await new Promise<void>((resolve) => {
			const invocation = piInvocation(args);
			const depth = Number(process.env[DEPTH_ENV] ?? 0) + 1;
			const child = spawn(invocation.command, invocation.args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, [DEPTH_ENV]: String(depth) },
			});
			let buffer = "";
			let aborted = false;
			let stoppedAfterSettle = false;
			let settleTimer: ReturnType<typeof setTimeout> | undefined;
			child.stdout.on("data", (chunk) => {
				buffer += chunk.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) if (core.applyEventLine(result, line)) onProgress(result);
				if (result.settled && !settleTimer) {
					settleTimer = setTimeout(() => {
						stoppedAfterSettle = true;
						child.kill("SIGTERM");
						setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
					}, SETTLE_GRACE_MS);
					settleTimer.unref();
				}
			});
			child.stderr.on("data", (chunk) => {
				result.stderr = (result.stderr + chunk.toString()).slice(-8192);
			});
			child.on("error", (error) => {
				result.exitCode = 1;
				result.stderr += error.message;
			});
			child.on("close", (code) => {
				if (buffer.trim()) core.applyEventLine(result, buffer);
				if (settleTimer) clearTimeout(settleTimer);
				result.exitCode = stoppedAfterSettle ? 0 : (code ?? 1);
				result.endedAt = Date.now();
				if (aborted) result.stopReason = "aborted";
				resolve();
			});
			const kill = () => {
				aborted = true;
				child.kill("SIGTERM");
				setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
			};
			if (signal?.aborted) kill();
			else signal?.addEventListener("abort", kill, { once: true });
		});
	} finally {
		if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true });
	}
	result.endedAt ??= Date.now();
	return result;
}

function summary(result: ChildResult) {
	const { agent, source, cwd, model, exitCode, turns, usage, stopReason, errorMessage, startedAt, endedAt, toolUses, contextTokens, activity } = result;
	return { agent, source, cwd, model, exitCode, turns, usage, stopReason, errorMessage, startedAt, endedAt, toolUses, contextTokens, activity, failed: core.isFailure(result), stderrTail: result.stderr.slice(-2000) };
}

/**
 * Names only, skill-style: `dir/{a,b}.md`. The model reads an agent's file (frontmatter says
 * when to use it, body is its prompt) only when it considers delegating to that agent.
 */
function agentCatalog(): string {
	const agents = core.discoverAgents({ lockin: LOCKIN_AGENTS_DIR, user: USER_AGENTS_DIR }, "user");
	if (!agents.length) return `No agents yet (${LOCKIN_AGENTS_DIR}, ${USER_AGENTS_DIR}); omit agent for a plain child.`;
	const byDir = new Map<string, string[]>();
	for (const agent of agents) {
		const dir = path.dirname(agent.filePath).replace(os.homedir(), "~");
		byDir.set(dir, [...(byDir.get(dir) ?? []), agent.name]);
	}
	const files = [...byDir].map(([dir, names]) => `${dir}/${names.length > 1 ? `{${names.join(",")}}` : names[0]}.md`);
	return `Agents: ${files.join(" ")} (project .pi/agents too). Read an agent's file before delegating to it; omit agent for a plain child.`;
}

export default function (pi: ExtensionAPI) {
	// ---------------------------------------------------------------- subagent
	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate isolated work to child pi processes; only each final answer comes back. Children do not see this conversation: write self-contained tasks.",
			`Exactly one mode: single {agent?, task}, parallel {tasks} (max ${core.MAX_PARALLEL_TASKS}, ${core.MAX_CONCURRENCY} at once), chain {chain} ({previous} = prior output).`,
			agentCatalog(),
		].join("\n"),
		parameters: SubagentParams,
		async execute(_id, params, signal, onUpdate, ctx) {
			const depth = Number(process.env[DEPTH_ENV] ?? 0);
			if (depth >= MAX_DEPTH) throw new Error(`Subagent nesting limit (${MAX_DEPTH}) reached; do the work directly.`);
			const { mode, tasks } = core.normalizeRequest(params);
			const scope = params.agentScope ?? "all";
			const projectDir = core.findProjectAgentsDir(ctx.cwd);
			const agents: any[] = core.discoverAgents({ lockin: LOCKIN_AGENTS_DIR, user: USER_AGENTS_DIR, project: projectDir }, scope);
			const byName = new Map(agents.map((agent) => [agent.name, agent]));

			const unknown = tasks.filter((task: any) => task.agent && !byName.has(task.agent)).map((task: any) => task.agent);
			if (unknown.length) throw new Error(`Unknown agent(s): ${[...new Set(unknown)].join(", ")}. Available: ${agents.map((a) => a.name).join(", ") || "none"}.`);

			const projectAgents = [...new Set(tasks.map((task: any) => byName.get(task.agent)).filter((agent: any) => agent?.source === "project").map((agent: any) => agent.name))];
			if (projectAgents.length && params.confirmProjectAgents !== false) {
				if (!ctx.hasUI) throw new Error(`Project-local agents (${projectAgents.join(", ")}) need confirmation, and there is no UI. Pass confirmProjectAgents: false only if this repo is trusted.`);
				const approved = await ctx.ui.confirm("Run project-local pi agents?", `Agents: ${projectAgents.join(", ")}\nSource: ${projectDir}`);
				if (!approved) throw new Error("Project-local agents were not approved.");
			}

			const aliases = loadAliases(ctx);
			const parent = parentModel(ctx);
			const start = (task: any, onProgress: (result: ChildResult) => void) => {
				const agent = task.agent ? byName.get(task.agent) : undefined;
				const model = core.resolveModel({ requested: task.model, agentModel: agent?.model, aliases, parentModel: parent });
				return runChild(agent, task, model, ctx.cwd, signal, onProgress);
			};
			let latest: (ChildResult | undefined)[] = [];
			const progress = (results: (ChildResult | undefined)[]) => {
				latest = results;
				onUpdate?.({
					content: [{ type: "text", text: results.map((r, i) => (r ? `${r.agent}: ${r.activity ?? "starting"} (${core.statsLine(r)})` : `task ${i + 1}: queued`)).join("\n") }],
					details: { mode, running: true, total: tasks.length, results: Array.from({ length: tasks.length }, (_, i) => (results[i] ? summary(results[i]!) : undefined)) },
				});
			};
			const ticker = onUpdate ? setInterval(() => latest.length && progress(latest), 1000) : undefined;
			ticker?.unref?.();
			try {
			const usage = (results: ChildResult[]) => results.reduce((total, r) => core.addUsage(total, r.usage), core.emptyUsage());

			if (mode === "chain") {
				const live: ChildResult[] = [];
				const { results, failedAt } = await core.runChain(tasks, (step: any, index: number) =>
					start(step, (current) => {
						live[index] = current;
						progress(live);
					}),
				);
				const details = { mode, results: results.map(summary) };
				if (failedAt !== undefined) {
					const failed = results[failedAt];
					return { content: [{ type: "text", text: `Chain step ${failedAt + 1} (${failed.agent}) failed: ${core.finalText(failed)}` }], details, usage: usage(results), isError: true };
				}
				return { content: [{ type: "text", text: core.truncate(core.finalText(results.at(-1))) }], details, usage: usage(results) };
			}

			if (mode === "parallel") {
				const live: (ChildResult | undefined)[] = new Array(tasks.length);
				const results: ChildResult[] = await core.runLimited(tasks, core.MAX_CONCURRENCY, (task: any, index: number) =>
					start(task, (current) => {
						live[index] = current;
						progress(live);
					}),
				);
				const report = results
					.map((r, i) => `### ${i + 1}. ${r.agent} ${core.isFailure(r) ? "FAILED" : "completed"}\n\n${core.finalText(r)}`)
					.join("\n\n---\n\n");
				const allFailed = results.every((r) => core.isFailure(r));
				return { content: [{ type: "text", text: core.truncate(report) }], details: { mode, results: results.map(summary) }, usage: usage(results), isError: allFailed };
			}

			const result = await start(tasks[0], (current) => progress([current]));
			const details = { mode, results: [summary(result)] };
			if (core.isFailure(result)) {
				return { content: [{ type: "text", text: `${result.agent} failed: ${core.finalText(result)}` }], details, usage: result.usage, isError: true };
			}
			return { content: [{ type: "text", text: core.truncate(core.finalText(result)) }], details, usage: result.usage };
			} finally {
				if (ticker) clearInterval(ticker);
			}
		},

		renderCall(args: any, theme: any) {
			const list: any[] = args.chain ?? args.tasks ?? [];
			const head = list.length ? `${args.chain ? "chain" : "parallel"} · ${list.length}` : args.agent || "pi";
			const first = (list.length ? "" : args.task ?? "").split("\n")[0];
			const preview = first.length > 70 ? `${first.slice(0, 69)}…` : first;
			return new Text(`${theme.fg("toolTitle", theme.bold("Subagent"))}${theme.fg("accent", `(${head})`)}${preview ? theme.fg("dim", ` ${preview}`) : ""}`, 0, 0);
		},

		renderResult(result: any, { expanded }: { expanded: boolean }, theme: any, context: any) {
			const details = result.details;
			if (!details?.results) {
				const t = result.content?.[0];
				return new Text(theme.fg("dim", t?.type === "text" ? t.text : "(no output)"), 0, 0);
			}
			const list: any[] = context?.args?.chain ?? context?.args?.tasks ?? [];
			const lines = details.results.map((r: any, i: number) => {
				const t = list[i];
				const what = t?.agent ?? String(t?.task ?? "").replace(/\s+/g, " ").trim();
				const label = list.length ? `${i + 1}. ${what.length > 40 ? `${what.slice(0, 39)}…` : what} · ` : "";
				if (!r) return `  ⎿  ${theme.fg("muted", `${label}queued`)}`;
				const stats = core.statsLine(r);
				if (details.running && !r.endedAt) return `  ⎿  ${theme.fg("accent", label)}${r.activity ?? "starting…"}\n     ${theme.fg("dim", stats)}`;
				const mark = r.failed ? theme.fg("error", `Failed${r.errorMessage ? `: ${r.errorMessage.slice(0, 80)}` : ""}`) : theme.fg("success", "Done");
				return `  ⎿  ${theme.fg("accent", label)}${mark} ${theme.fg("dim", `(${stats})`)}`;
			});
			let text = lines.join("\n");
			if (!details.running) {
				const body = result.content?.[0]?.type === "text" ? result.content[0].text : "";
				if (expanded && body) text += `\n\n${body}`;
				else if (body) text += `\n     ${theme.fg("muted", "(ctrl+o to expand)")}`;
			}
			return new Text(text, 0, 0);
		},
	});

	// ------------------------------------------------------------ lockin mode
	const state = { enabled: false, pendingActivation: false };

	const showStatus = (ctx: ExtensionContext) => {
		if (ctx.hasUI) ctx.ui.setStatus(core.LOCKIN_STATUS, state.enabled ? "lockin" : undefined);
	};
	const setEnabled = (enabled: boolean, ctx: ExtensionContext) => {
		// Ask for the skill read only on an off -> on transition (or while one is still owed).
		state.pendingActivation = enabled && (state.pendingActivation || !state.enabled);
		state.enabled = enabled;
		pi.appendEntry(core.LOCKIN_ENTRY, { enabled });
		showStatus(ctx);
	};

	pi.on("session_start", (_event, ctx) => {
		state.enabled = core.lockinFromEntries(ctx.sessionManager.getBranch());
		// A resumed lockin session re-reads the skill once in this process.
		state.pendingActivation = state.enabled;
		showStatus(ctx);
	});

	pi.on("input", (event, ctx) => {
		// `/skill:lockin` loads the skill itself, so only the sticky reminder is needed.
		if (/^\/skill:lockin(?:\s|$)/.test(event.text)) {
			setEnabled(true, ctx);
			state.pendingActivation = false;
		}
		return { action: "continue" } as const;
	});

	pi.on("before_agent_start", (event) => {
		const text = core.injectionFor(state, event.messageType, SKILL_PATH);
		if (!text) return undefined;
		state.pendingActivation = false;
		return { message: { customType: "lockin-reminder", content: text, display: false } };
	});

	pi.registerCommand("lockin", {
		description: "Sticky lockin mode for this session. Usage: /lockin [task] | /lockin off",
		handler: async (args, ctx) => {
			const parsed = core.parseLockinArgs(args);
			if (parsed.action === "off") {
				setEnabled(false, ctx);
				if (ctx.hasUI) ctx.ui.notify("Lockin mode off.", "info");
				return;
			}
			setEnabled(true, ctx);
			if (parsed.task) pi.sendUserMessage(parsed.task, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
			else if (ctx.hasUI) ctx.ui.notify("Lockin mode on. Your next message is routed through the lockin skill.", "info");
		},
	});
}
