// biome-ignore-all lint/style/useNamingConvention: TelemetryDeps interface matches domain terminology
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
    appendFile,
    mkdir,
    readFile,
    realpath,
    writeFile,
} from "node:fs/promises";
import { createInterface } from "node:readline";
import { createGetRepositoryRoot } from "./git-utils.js";
import { handleInit } from "./init-command.js";
import { runLog } from "./log/index.js";
import { resolveMode } from "./mode.js";
import { handlePolicyCheck } from "./policy-check.js";
import { handlePolicyInit } from "./policy-init.js";
import { scanProject } from "./project-scanner.js";
import { handleRecord } from "./record.js";
import { sanitizeForStderr } from "./sanitize.js";
import type { ShimResult } from "./shim.js";
import { runShim } from "./shim.js";
import type { TelemetryDeps } from "./telemetry.js";
import { emitScriptEndEvent, emitShimErrorEvent } from "./telemetry.js";

const VERSION = "0.1.0";

const USAGE = `Usage: agent-shell -c <command>
       agent-shell init [--flight-recorder] [--policy] [--no-flight-recorder] [--no-policy]
       agent-shell record
       agent-shell policy-check
       agent-shell policy --init [--model=<model>]
       agent-shell log
       agent-shell --version

Environment:
  AGENTSHELL_PASSTHROUGH=1  Bypass instrumentation
`;

const MAX_STDIN_BYTES = 1024 * 1024; // 1 MiB — reject oversized hook payloads

function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        process.stdin.on("data", (chunk: Buffer) => {
            totalBytes += chunk.length;
            if (totalBytes > MAX_STDIN_BYTES) {
                process.stdin.destroy();
                reject(new Error("stdin exceeds maximum allowed size"));
                return;
            }
            chunks.push(chunk);
        });
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
            // Use exitCode + return (not process.exit) so pending stdout writes
            // from writeStdout can drain before the process terminates.
            process.exitCode = 0;
            return;
        }
        case "policy-init": {
            try {
                const getRepositoryRoot = createGetRepositoryRoot(
                    undefined,
                    process.env,
                );
                await handlePolicyInit({
                    getRepositoryRoot,
                    writeStdout: (data) => process.stdout.write(data),
                    writeStderr: (data) => process.stderr.write(data),
                    model: mode.model,
                });
                process.exitCode = 0;
            } catch (err) {
                process.stderr.write(
                    `agent-shell: policy init error: ${sanitizeForStderr(err)}\n`,
                );
                process.exitCode = 1;
            }
            return;
        }
        case "record": {
            try {
                const getRepositoryRoot = createGetRepositoryRoot(
                    undefined,
                    process.env,
                );
                await handleRecord({
                    readStdin: () => readStdin(),
                    writeStderr: (data) => process.stderr.write(data),
                    env: process.env,
                    telemetryDeps: createDefaultDeps(),
                    getRepositoryRoot,
                });
                process.exitCode = 0;
            } catch (err) {
                process.stderr.write(
                    `agent-shell: record error: ${sanitizeForStderr(err)}\n`,
                );
                process.exitCode = 1;
            }
            return;
        }
        case "init": {
            try {
                if (mode.unknownArgs.length > 0) {
                    process.stderr.write(
                        `agent-shell: unknown flag(s): ${mode.unknownArgs.join(", ")}\n`,
                    );
                    process.exitCode = 1;
                    return;
                }
                const getRepositoryRoot = createGetRepositoryRoot(
                    undefined,
                    process.env,
                );
                const isTty = Boolean(process.stdin.isTTY);
                const prompt = isTty
                    ? async (message: string): Promise<boolean> => {
                          const rl = createInterface({
                              input: process.stdin,
                              output: process.stdout,
                          });
                          try {
                              return await new Promise<boolean>(
                                  (resolvePrompt) => {
                                      rl.question(
                                          `${message} (Y/n) `,
                                          (answer) => {
                                              const trimmed = answer
                                                  .trim()
                                                  .toLowerCase();
                                              resolvePrompt(
                                                  trimmed === "" ||
                                                      trimmed === "y" ||
                                                      trimmed === "yes",
                                              );
                                          },
                                      );
                                  },
                              );
                          } finally {
                              rl.close();
                          }
                      }
                    : undefined;
                const ok = await handleInit(
                    {
                        flightRecorder: mode.flightRecorder,
                        policy: mode.policy,
                        noFlightRecorder: mode.noFlightRecorder,
                        noPolicy: mode.noPolicy,
                    },
                    {
                        getRepositoryRoot,
                        writeStdout: (data) => process.stdout.write(data),
                        writeStderr: (data) => process.stderr.write(data),
                        readFile: (path, encoding) => readFile(path, encoding),
                        writeFile: (path, content) => writeFile(path, content),
                        mkdir: (path, opts) =>
                            mkdir(path, opts).then(() => undefined),
                        realpath: (path) => realpath(path),
                        scanProject: (dir) => scanProject(dir),
                        isTty,
                        prompt,
                    },
                );
                process.exitCode = ok ? 0 : 1;
            } catch (err) {
                process.stderr.write(
                    `agent-shell: init error: ${sanitizeForStderr(err)}\n`,
                );
                process.exitCode = 1;
            }
            return;
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
            process.exitCode = 0;
            return;
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
                            `agent-shell: telemetry write error: ${sanitizeForStderr(err)}\n`,
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
                    `agent-shell: context capture error: ${sanitizeForStderr(err)}\n`,
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
            process.exitCode = 1;
            return;
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
