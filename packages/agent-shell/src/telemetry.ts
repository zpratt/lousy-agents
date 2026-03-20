// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import { dirname, join, resolve } from "node:path";
import { detectActor } from "./actor.js";
import { captureEnv, captureTags } from "./env-capture.js";
import { isWithinProjectRoot } from "./path-utils.js";
import type { ShimResult } from "./shim.js";
import type {
    PolicyDecisionEvent,
    ScriptEndEvent,
    ShimErrorEvent,
} from "./types.js";
import { SCHEMA_VERSION } from "./types.js";

export interface TelemetryDeps {
    mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
    appendFile: (path: string, data: string) => Promise<void>;
    realpath: (path: string) => Promise<string>;
    cwd: () => string;
    randomUUID: () => string;
    writeStderr: (msg: string) => void;
    now: () => string;
}

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const DEFAULT_EVENTS_SUBDIR = ".agent-shell/events";
const MAX_ANCESTOR_DEPTH = 50;

function isPathNotFoundError(err: unknown): boolean {
    if (typeof err === "object" && err !== null && "code" in err) {
        const code = (err as { code: unknown }).code;
        return code === "ENOENT" || code === "ENOTDIR";
    }
    return false;
}

async function realpathExistingAncestor(
    targetPath: string,
    deps: Pick<TelemetryDeps, "realpath">,
): Promise<string | null> {
    let current = targetPath;
    for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
        try {
            return await deps.realpath(current);
        } catch (err) {
            if (!isPathNotFoundError(err)) throw err;
            const parent = dirname(current);
            if (parent === current) return null;
            current = parent;
        }
    }
    return null;
}

export function resolveSessionId(
    env: Record<string, string | undefined>,
    deps: TelemetryDeps,
): string {
    const provided = env.AGENTSHELL_SESSION_ID;

    if (provided === undefined || provided === "") {
        return deps.randomUUID();
    }

    if (
        provided.includes("..") ||
        provided.includes("/") ||
        provided.includes("\\") ||
        !SESSION_ID_PATTERN.test(provided)
    ) {
        deps.writeStderr(
            `agent-shell: invalid AGENTSHELL_SESSION_ID "${provided}", generating new ID\n`,
        );
        return deps.randomUUID();
    }

    return provided;
}

export async function resolveWriteEventsDir(
    env: Record<string, string | undefined>,
    deps: TelemetryDeps,
): Promise<string> {
    const projectRoot = deps.cwd();
    const defaultDir = join(projectRoot, DEFAULT_EVENTS_SUBDIR);

    const logDir = env.AGENTSHELL_LOG_DIR;

    if (logDir !== undefined && logDir !== "") {
        if (logDir.includes("..")) {
            deps.writeStderr(
                `agent-shell: AGENTSHELL_LOG_DIR contains path traversal, using default\n`,
            );
            await deps.mkdir(defaultDir, { recursive: true });
            return defaultDir;
        }

        // Reject external paths (including absolute) before any filesystem side-effects
        const resolvedLogical = resolve(projectRoot, logDir);
        if (!isWithinProjectRoot(resolvedLogical, projectRoot)) {
            deps.writeStderr(
                `agent-shell: AGENTSHELL_LOG_DIR resolves outside project root, using default\n`,
            );
            await deps.mkdir(defaultDir, { recursive: true });
            return defaultDir;
        }

        // Validate existing ancestor realpath before mkdir to prevent symlink escape
        const ancestorReal = await realpathExistingAncestor(
            resolvedLogical,
            deps,
        );
        if (
            ancestorReal === null ||
            !isWithinProjectRoot(ancestorReal, projectRoot)
        ) {
            deps.writeStderr(
                `agent-shell: AGENTSHELL_LOG_DIR resolves outside project root via ancestor symlink, using default\n`,
            );
            await deps.mkdir(defaultDir, { recursive: true });
            return defaultDir;
        }

        await deps.mkdir(resolvedLogical, { recursive: true });

        const resolved = await deps.realpath(resolvedLogical);

        if (!isWithinProjectRoot(resolved, projectRoot)) {
            deps.writeStderr(
                `agent-shell: AGENTSHELL_LOG_DIR resolves outside project root, using default\n`,
            );
            await deps.mkdir(defaultDir, { recursive: true });
            return defaultDir;
        }

        return resolved;
    }

    await deps.mkdir(defaultDir, { recursive: true });
    return defaultDir;
}

async function writeEvent(
    eventsDir: string,
    sessionId: string,
    event: ScriptEndEvent | ShimErrorEvent | PolicyDecisionEvent,
    deps: TelemetryDeps,
): Promise<void> {
    const filePath = join(eventsDir, `${sessionId}.jsonl`);
    const line = `${JSON.stringify(event)}\n`;
    await deps.appendFile(filePath, line);
}

export async function emitScriptEndEvent(
    options: {
        command: string;
        result: ShimResult;
        env: Record<string, string | undefined>;
    },
    deps: TelemetryDeps,
): Promise<void> {
    const sessionId = resolveSessionId(options.env, deps);
    const eventsDir = await resolveWriteEventsDir(options.env, deps);

    const capturedEnv = captureEnv(options.env);
    const tags = captureTags(options.env);

    const event: ScriptEndEvent = {
        v: SCHEMA_VERSION,
        session_id: sessionId,
        event: "script_end",
        command: options.command,
        actor: detectActor(options.env),
        exit_code: options.result.exitCode,
        signal: options.result.signal,
        duration_ms: options.result.durationMs,
        timestamp: deps.now(),
        env: capturedEnv,
        tags,
        ...(options.env.npm_lifecycle_event && {
            script: options.env.npm_lifecycle_event,
        }),
        ...(options.env.npm_package_name && {
            package: options.env.npm_package_name,
        }),
        ...(options.env.npm_package_version && {
            package_version: options.env.npm_package_version,
        }),
    };

    await writeEvent(eventsDir, sessionId, event, deps);
}

export async function emitShimErrorEvent(
    options: {
        command: string;
        env: Record<string, string | undefined>;
        error: unknown;
    },
    deps: TelemetryDeps,
): Promise<void> {
    const sessionId = resolveSessionId(options.env, deps);
    const eventsDir = await resolveWriteEventsDir(options.env, deps);

    const capturedEnv = captureEnv(options.env);
    const tags = captureTags(options.env);

    const event: ShimErrorEvent = {
        v: SCHEMA_VERSION,
        session_id: sessionId,
        event: "shim_error",
        command: options.command,
        actor: detectActor(options.env),
        timestamp: deps.now(),
        env: capturedEnv,
        tags,
    };

    await writeEvent(eventsDir, sessionId, event, deps);
}

export async function emitPolicyDecisionEvent(
    options: {
        command: string;
        decision: "allow" | "deny";
        matched_rule: string | null;
        env: Record<string, string | undefined>;
        projectRoot: string;
    },
    deps: TelemetryDeps,
): Promise<void> {
    const depsWithProjectRoot: TelemetryDeps = {
        ...deps,
        cwd: () => options.projectRoot,
    };

    const sessionId = resolveSessionId(options.env, deps);
    const eventsDir = await resolveWriteEventsDir(
        options.env,
        depsWithProjectRoot,
    );

    const capturedEnv = captureEnv(options.env);
    const tags = captureTags(options.env);

    const event: PolicyDecisionEvent = {
        v: SCHEMA_VERSION,
        session_id: sessionId,
        event: "policy_decision",
        command: options.command,
        decision: options.decision,
        matched_rule: options.matched_rule,
        actor: detectActor(options.env),
        timestamp: deps.now(),
        env: capturedEnv,
        tags,
    };

    await writeEvent(eventsDir, sessionId, event, depsWithProjectRoot);
}
