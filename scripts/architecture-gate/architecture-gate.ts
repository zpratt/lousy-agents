import { GateError } from "./gate-error.js";
import { listUncommittedPackageChanges } from "./list-uncommitted-changes.js";
import { runArchitectureGate } from "./run-gate.js";
import { spawnCoach } from "./spawn-coach.js";
import { describeUncommittedChanges } from "./uncommitted-changes.js";

const FAILURE_EXIT_CODE = 1;

function noteUncommittedChanges(paths: readonly string[]): void {
    const notice = describeUncommittedChanges(paths);
    if (notice !== null) {
        process.stderr.write(`${notice}\n`);
    }
}

async function main(): Promise<number> {
    noteUncommittedChanges(await listUncommittedPackageChanges());
    try {
        const verdict = await runArchitectureGate((args) => spawnCoach(args));
        if (verdict.passed) {
            process.stdout.write("architecture gate: no layer violations\n");
            return 0;
        }
        process.stderr.write(
            `architecture gate: FAILED\n${verdict.messages.join("\n")}\n`,
        );
        return FAILURE_EXIT_CODE;
    } catch (error) {
        if (error instanceof GateError) {
            process.stderr.write(
                `architecture gate: FAILED\n${error.message}\n`,
            );
            return FAILURE_EXIT_CODE;
        }
        throw error;
    }
}

process.exitCode = await main();
