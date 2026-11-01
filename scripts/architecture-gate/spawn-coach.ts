import { spawn } from "node:child_process";
import type { CoachRun } from "./coach-verdict.js";
import { GateError } from "./gate-error.js";

const COACH_TIMEOUT_MILLISECONDS = 10 * 60 * 1000;
const KILL_GRACE_MILLISECONDS = 10 * 1000;

export interface SpawnOptions {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    /** How long coach may run before it is asked to stop with SIGTERM */
    readonly timeoutMilliseconds?: number;
    /** How long it then has to stop before it is killed with SIGKILL */
    readonly killGraceMilliseconds?: number;
}

/**
 * Runs the `coach` executable found on PATH, without a shell, and collects its
 * output. Coach that outlives the timeout is sent SIGTERM and, if it ignores
 * that, SIGKILL after a grace period; either way the run ends with a signal,
 * which the verdict treats as a failure. Throws when coach cannot be started.
 */
export function spawnCoach(
    args: readonly string[],
    options: SpawnOptions = {},
): Promise<CoachRun> {
    return new Promise((resolve, reject) => {
        const child = spawn("coach", [...args], {
            cwd: options.cwd ?? process.cwd(),
            env: options.env ?? process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let killTimer: NodeJS.Timeout | undefined;
        const stopTimer = setTimeout(() => {
            child.kill("SIGTERM");
            killTimer = setTimeout(
                () => child.kill("SIGKILL"),
                options.killGraceMilliseconds ?? KILL_GRACE_MILLISECONDS,
            );
        }, options.timeoutMilliseconds ?? COACH_TIMEOUT_MILLISECONDS);
        const stopTimers = () => {
            clearTimeout(stopTimer);
            clearTimeout(killTimer);
        };
        child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
        child.on("error", (error) => {
            stopTimers();
            reject(new GateError(`could not run coach: ${error.message}`));
        });
        child.on("close", (exitCode) => {
            stopTimers();
            resolve({
                exitCode,
                stdout: Buffer.concat(stdout).toString("utf8"),
                stderr: Buffer.concat(stderr).toString("utf8"),
            });
        });
    });
}
