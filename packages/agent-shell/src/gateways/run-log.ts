import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { createInterface } from "node:readline";
import {
    formatEventsJson,
    formatEventsTable,
    formatSessionsTable,
} from "../lib/log-format.js";
import { listDirectoryWithinRoot, statWithinRoot } from "../lib/safe-fs.js";
import { parseLogArgs } from "../use-cases/log-command.js";
import type { QueryDeps } from "./log-query.js";
import {
    listSessions,
    parseDuration,
    queryEvents,
    resolveReadEventsDir,
} from "./log-query.js";

function relativePathUnderRoot(rootDir: string, path: string): string {
    const relativePath = relative(rootDir, path);
    if (
        relativePath === "" ||
        relativePath === ".." ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
    ) {
        throw new Error("Path resolves outside project root");
    }
    return relativePath;
}

async function* readSafeFileLines(
    rootDir: string,
    path: string,
): AsyncIterable<string> {
    const relativePath = relativePathUnderRoot(rootDir, path);
    await statWithinRoot(rootDir, relativePath);
    const rl = createInterface({
        input: createReadStream(join(rootDir, relativePath)),
        crlfDelay: Infinity,
    });
    for await (const line of rl) {
        yield line;
    }
}

function createDefaultQueryDeps(): QueryDeps {
    const rootDir = process.cwd();
    return {
        readdir: async (path) => {
            const relativePath = relativePathUnderRoot(rootDir, path);
            const entries = await listDirectoryWithinRoot(
                rootDir,
                relativePath,
            );
            return entries.map((entry) => entry.name);
        },
        stat: async (path) => {
            const relativePath = relativePathUnderRoot(rootDir, path);
            const s = await statWithinRoot(rootDir, relativePath);
            return { mtimeMs: s.mtimeMs };
        },
        realpath: (path) => realpath(path),
        cwd: () => process.cwd(),
        readFileLines: (path) => readSafeFileLines(rootDir, path),
        writeStderr: (msg) => {
            process.stderr.write(msg);
        },
    };
}

export async function runLog(args: string[]): Promise<number> {
    const options = parseLogArgs(args);
    const deps = createDefaultQueryDeps();

    if (options.errors && options.errors.length > 0) {
        for (const err of options.errors) {
            process.stderr.write(`agent-shell: ${err}\n`);
        }
        return 1;
    }

    const { dir, error } = await resolveReadEventsDir(process.env, deps);
    if (error) {
        process.stderr.write(`agent-shell: ${error}\n`);
        return 1;
    }

    if (options.last) {
        try {
            parseDuration(options.last);
        } catch (err) {
            process.stderr.write(`agent-shell: ${(err as Error).message}\n`);
            return 1;
        }
    }

    try {
        await deps.readdir(dir);
    } catch {
        process.stdout.write("No events recorded yet.\n\n");
        process.stdout.write(
            "To enable instrumentation, add to your .npmrc:\n",
        );
        process.stdout.write(
            "  script-shell=./node_modules/.bin/agent-shell\n",
        );
        return 0;
    }

    if (options.listSessions) {
        const sessions = await listSessions(dir, deps);
        if (sessions.length === 0) {
            process.stdout.write("No sessions found.\n");
            return 0;
        }
        process.stdout.write(formatSessionsTable(sessions));
        process.stdout.write("\n");
        return 0;
    }

    const result = await queryEvents(
        dir,
        {
            actor: options.actor,
            failures: options.failures || undefined,
            script: options.script,
            last: options.last,
        },
        deps,
    );

    if (result.events.length === 0) {
        process.stdout.write("No matching events found.\n");
        return 0;
    }

    if (options.json) {
        process.stdout.write(formatEventsJson(result.events));
        process.stdout.write("\n");
    } else {
        process.stdout.write(formatEventsTable(result.events));
        process.stdout.write("\n");
    }

    return 0;
}
