import { createReadStream } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import type { QueryDeps } from "../gateways/log-query.js";
import {
    listSessions,
    parseDuration,
    queryEvents,
    resolveReadEventsDir,
} from "../gateways/log-query.js";
import {
    formatEventsJson,
    formatEventsTable,
    formatSessionsTable,
} from "../lib/log-format.js";

export interface LogOptions {
    last?: string;
    actor?: string;
    failures: boolean;
    script?: string;
    listSessions: boolean;
    json: boolean;
    errors?: string[];
}

export function parseLogArgs(args: string[]): LogOptions {
    const options: LogOptions = {
        failures: false,
        listSessions: false,
        json: false,
    };

    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        switch (arg) {
            case "--last":
                if (i + 1 < args.length) {
                    options.last = args[++i];
                } else {
                    options.errors = options.errors ?? [];
                    options.errors.push(
                        "--last requires a value (e.g., 30m, 1h, 1d)",
                    );
                }
                break;
            case "--actor":
                if (i + 1 < args.length) {
                    options.actor = args[++i];
                } else {
                    options.errors = options.errors ?? [];
                    options.errors.push("--actor requires a value");
                }
                break;
            case "--failures":
                options.failures = true;
                break;
            case "--script":
                if (i + 1 < args.length) {
                    options.script = args[++i];
                } else {
                    options.errors = options.errors ?? [];
                    options.errors.push("--script requires a value");
                }
                break;
            case "--list-sessions":
                options.listSessions = true;
                break;
            case "--json":
                options.json = true;
                break;
        }

        i++;
    }

    return options;
}

function createDefaultQueryDeps(): QueryDeps {
    return {
        readdir: (path) => readdir(path),
        stat: (path) => stat(path).then((s) => ({ mtimeMs: s.mtimeMs })),
        realpath: (path) => realpath(path),
        cwd: () => process.cwd(),
        readFileLines: (path) =>
            createInterface({
                input: createReadStream(path, { encoding: "utf-8" }),
            }),
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
