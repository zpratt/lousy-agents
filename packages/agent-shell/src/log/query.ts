// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import { join, resolve } from "node:path";
import { isPathNotFoundError, isWithinProjectRoot } from "../path-utils.js";
import type { ScriptEvent } from "../types.js";
import { ScriptEventSchema } from "../types.js";

export interface QueryDeps {
    readdir: (path: string) => Promise<string[]>;
    stat: (path: string) => Promise<{ mtimeMs: number }>;
    realpath: (path: string) => Promise<string>;
    cwd: () => string;
    readFileLines: (path: string) => AsyncIterable<string>;
    writeStderr: (msg: string) => void;
}

export interface QueryFilters {
    actor?: string;
    failures?: boolean;
    script?: string;
    last?: string;
}

export interface QueryResult {
    events: ScriptEvent[];
    truncatedFiles: string[];
}

export interface SessionSummary {
    sessionId: string;
    firstEvent: string;
    lastEvent: string;
    eventCount: number;
    actors: string[];
}

const DURATION_PATTERN = /^(\d+)([mhd])$/;
const MAX_LINE_BYTES = 65_536;
const MAX_LINES_PER_FILE = 100_000;

const UNIT_MS: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
};

export function parseDuration(duration: string): number {
    const match = DURATION_PATTERN.exec(duration);
    if (!match) {
        throw new Error(
            `Invalid duration format: "${duration}". Expected format: <number><unit> where unit is m, h, or d`,
        );
    }

    const value = Number.parseInt(match[1], 10);
    if (value <= 0) {
        throw new Error(
            `Duration must be a positive value, got: "${duration}"`,
        );
    }

    const unit = match[2];
    return value * UNIT_MS[unit];
}

export async function resolveReadEventsDir(
    env: Record<string, string | undefined>,
    deps: QueryDeps,
): Promise<{ dir: string; error?: string }> {
    const projectRoot = deps.cwd();
    const defaultDir = join(projectRoot, ".agent-shell", "events");

    const logDir = env.AGENTSHELL_LOG_DIR;

    if (logDir !== undefined && logDir !== "") {
        const projectRootReal = await deps.realpath(projectRoot);
        const candidate = resolve(projectRoot, logDir);

        if (
            !isWithinProjectRoot(candidate, projectRoot) &&
            !isWithinProjectRoot(candidate, projectRootReal)
        ) {
            return {
                dir: "",
                error: "AGENTSHELL_LOG_DIR resolves outside project root",
            };
        }

        let resolved: string;
        try {
            resolved = await deps.realpath(candidate);
        } catch (err: unknown) {
            if (isPathNotFoundError(err)) {
                return {
                    dir: "",
                    error: "AGENTSHELL_LOG_DIR does not exist or is not a directory",
                };
            }
            throw err;
        }

        if (
            !isWithinProjectRoot(resolved, projectRoot) &&
            !isWithinProjectRoot(resolved, projectRootReal)
        ) {
            return {
                dir: "",
                error: "AGENTSHELL_LOG_DIR resolves outside project root",
            };
        }

        return { dir: resolved };
    }

    return { dir: defaultDir };
}

function findMostRecentFile(
    fileMtimes: Array<{ file: string; mtimeMs: number }>,
): string {
    let mostRecent = fileMtimes[0];
    for (let i = 1; i < fileMtimes.length; i++) {
        if (fileMtimes[i].mtimeMs > mostRecent.mtimeMs) {
            mostRecent = fileMtimes[i];
        }
    }
    return mostRecent.file;
}

function matchesFilters(
    event: ScriptEvent,
    filters: QueryFilters,
    cutoffMs: number | undefined,
): boolean {
    if (filters.actor !== undefined && event.actor !== filters.actor) {
        return false;
    }
    if (
        filters.failures &&
        !(event.event === "script_end" && event.exit_code !== 0)
    ) {
        return false;
    }
    if (
        filters.script !== undefined &&
        !(event.event === "script_end" && event.script === filters.script)
    ) {
        return false;
    }
    if (cutoffMs !== undefined) {
        const eventMs = new Date(event.timestamp).getTime();
        if (eventMs < cutoffMs) {
            return false;
        }
    }
    return true;
}

function parseLine(line: string): ScriptEvent | undefined {
    if (Buffer.byteLength(line, "utf-8") > MAX_LINE_BYTES) {
        return undefined;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(line);
    } catch {
        return undefined;
    }

    const result = ScriptEventSchema.safeParse(parsed);
    if (!result.success) {
        return undefined;
    }

    return result.data;
}

export async function queryEvents(
    eventsDir: string,
    filters: QueryFilters,
    deps: QueryDeps,
): Promise<QueryResult> {
    const allFiles = await deps.readdir(eventsDir);
    const jsonlFiles = allFiles.filter((f) => f.endsWith(".jsonl"));

    if (jsonlFiles.length === 0) {
        return { events: [], truncatedFiles: [] };
    }

    let filesToRead: string[];

    if (filters.last === undefined) {
        const fileMtimes = await Promise.all(
            jsonlFiles.map(async (file) => {
                const filePath = join(eventsDir, file);
                const s = await deps.stat(filePath);
                return { file, mtimeMs: s.mtimeMs };
            }),
        );
        filesToRead = [findMostRecentFile(fileMtimes)];
    } else {
        filesToRead = jsonlFiles;
    }

    const cutoffMs = filters.last
        ? Date.now() - parseDuration(filters.last)
        : undefined;

    const events: ScriptEvent[] = [];
    const truncatedFiles: string[] = [];

    for (const file of filesToRead) {
        const filePath = join(eventsDir, file);
        let lineCount = 0;

        for await (const line of deps.readFileLines(filePath)) {
            if (lineCount >= MAX_LINES_PER_FILE) {
                deps.writeStderr(
                    `agent-shell: file ${file} exceeds ${MAX_LINES_PER_FILE} lines, truncating\n`,
                );
                truncatedFiles.push(file);
                break;
            }
            lineCount++;

            const event = parseLine(line);
            if (event === undefined) {
                continue;
            }

            if (matchesFilters(event, filters, cutoffMs)) {
                events.push(event);
            }
        }
    }

    return { events, truncatedFiles };
}

export async function listSessions(
    eventsDir: string,
    deps: QueryDeps,
): Promise<SessionSummary[]> {
    const allFiles = await deps.readdir(eventsDir);
    const jsonlFiles = allFiles.filter((f) => f.endsWith(".jsonl"));

    if (jsonlFiles.length === 0) {
        return [];
    }

    const summaries: SessionSummary[] = [];

    for (const file of jsonlFiles) {
        const sessionId = file.replace(/\.jsonl$/, "");
        const filePath = join(eventsDir, file);
        let firstEvent: string | undefined;
        let lastEvent: string | undefined;
        let eventCount = 0;
        const actorSet = new Set<string>();

        for await (const line of deps.readFileLines(filePath)) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(line);
            } catch {
                continue;
            }

            const result = ScriptEventSchema.safeParse(parsed);
            if (!result.success) {
                continue;
            }

            const event = result.data;
            eventCount++;
            actorSet.add(event.actor);

            if (firstEvent === undefined || event.timestamp < firstEvent) {
                firstEvent = event.timestamp;
            }
            if (lastEvent === undefined || event.timestamp > lastEvent) {
                lastEvent = event.timestamp;
            }
        }

        if (
            eventCount > 0 &&
            firstEvent !== undefined &&
            lastEvent !== undefined
        ) {
            summaries.push({
                sessionId,
                firstEvent,
                lastEvent,
                eventCount,
                actors: [...actorSet],
            });
        }
    }

    summaries.sort((a, b) => b.lastEvent.localeCompare(a.lastEvent));

    return summaries;
}
