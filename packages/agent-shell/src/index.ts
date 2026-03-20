// biome-ignore-all lint/style/useNamingConvention: TelemetryDeps interface matches domain terminology
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, realpath } from "node:fs/promises";
import { createGetRepositoryRoot } from "./git-utils.js";
import { runLog } from "./log/index.js";
import { resolveMode } from "./mode.js";
import { handlePolicyCheck } from "./policy-check.js";
import type { ShimResult } from "./shim.js";
import { runShim } from "./shim.js";
import type { TelemetryDeps } from "./telemetry.js";
import { emitScriptEndEvent, emitShimErrorEvent } from "./telemetry.js";

const VERSION = "0.1.0";

const USAGE = `Usage: agent-shell -c <command>
       agent-shell policy-check
       agent-shell --version
       agent-shell log

Environment:
  AGENTSHELL_PASSTHROUGH=1  Bypass instrumentation
`;

function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
        process.stdin.on("end", () =>
            resolve(Buffer.concat(chunks).toString("utf-8")),
        );
        process.stdin.on("error", reject);
    });
}

async function main(): Promise<void> {
    const mode = resolveMode(process.argv.slice(2), process.env);

    switch (mode.type) {
        case "policy-check": {
            const getRepositoryRoot = createGetRepositoryRoot(
                undefined,
                process.env,
            );
            await handlePolicyCheck({
                readStdin: () => readStdin(),
                writeStdout: (data) => process.stdout.write(data),
                writeStderr: (data) => process.stderr.write(data),
                env: process.env,
                policyDeps: {
                    realpath: (path) => realpath(path),
                    readFile: (path, encoding) => readFile(path, encoding),
                    getRepositoryRoot,
                },
                telemetryDeps: createDefaultDeps(),
            });
            process.exit(0);
            break;
        }
        case "passthrough": {
            const result = spawnSync("/bin/sh", mode.args, {
                stdio: "inherit",
            });
            process.exit(result.status ?? 1);
            break;
        }
        case "version": {
            process.stdout.write(`${VERSION}\n`);
            process.exit(0);
            break;
        }
        case "shim": {
            let onComplete: ((result: ShimResult) => Promise<void>) | undefined;

            try {
                const env = process.env;
                const command = mode.command;
                onComplete = async (result: ShimResult) => {
                    try {
                        await emitScriptEndEvent(
                            { command, result, env },
                            createDefaultDeps(),
                        );
                    } catch (err) {
                        process.stderr.write(
                            `agent-shell: telemetry write error: ${err}\n`,
                        );
                        try {
                            await emitShimErrorEvent(
                                { command, env, error: err },
                                createDefaultDeps(),
                            );
                        } catch {
                            // best effort — silently ignore double failure
                        }
                    }
                };
            } catch (err) {
                process.stderr.write(
                    `agent-shell: context capture error: ${err}\n`,
                );
            }

            const result = await runShim({
                command: mode.command,
                onComplete,
            });
            process.exit(result.exitCode);
            break;
        }
        case "log": {
            const logArgs = process.argv.slice(3);
            const exitCode = await runLog(logArgs);
            process.exit(exitCode);
            break;
        }
        case "usage": {
            process.stderr.write(USAGE);
            process.exit(1);
            break;
        }
    }
}

main();

function createDefaultDeps(): TelemetryDeps {
    return {
        mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
        appendFile: (path, data) => appendFile(path, data),
        realpath: (path) => realpath(path),
        cwd: () => process.cwd(),
        randomUUID: () => randomUUID(),
        writeStderr: (msg) => {
            process.stderr.write(msg);
        },
        now: () => new Date().toISOString(),
    };
}
