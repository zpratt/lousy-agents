import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

export interface ShimOptions {
    command: string;
    onComplete?: (result: ShimResult) => Promise<void>;
}

export interface ShimResult {
    exitCode: number;
    signal: string | null;
    durationMs: number;
}

const signalCodes = new Map<string, number>([
    ["SIGINT", 2],
    ["SIGTERM", 15],
    ["SIGTSTP", 20],
]);

const FORWARDED_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGTSTP"];

export async function runShim(options: ShimOptions): Promise<ShimResult> {
    const startTime = performance.now();

    return new Promise<ShimResult>((resolve) => {
        const child: ChildProcess = spawn("/bin/sh", ["-c", options.command], {
            stdio: "inherit",
        });

        const handlers = new Map<NodeJS.Signals, () => void>();

        for (const signal of FORWARDED_SIGNALS) {
            const handler = () => {
                child.kill(signal);
            };
            handlers.set(signal, handler);
            process.on(signal, handler);
        }

        child.on("close", async (code, signal) => {
            for (const [sig, handler] of handlers) {
                process.removeListener(sig, handler);
            }

            const durationMs = performance.now() - startTime;

            let exitCode: number;
            if (signal) {
                const signalNumber = signalCodes.get(signal) ?? 1;
                exitCode = 128 + signalNumber;
            } else {
                exitCode = code ?? 1;
            }

            const result: ShimResult = {
                exitCode,
                signal: signal ?? null,
                durationMs,
            };

            if (options.onComplete) {
                try {
                    await options.onComplete(result);
                } catch {
                    // onComplete errors must not prevent shim result from resolving
                }
            }

            resolve(result);
        });
    });
}
