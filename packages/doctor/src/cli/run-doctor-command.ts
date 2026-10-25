import { resolve } from "node:path";
import type { ConsolaInstance } from "consola";
import { presentDoctorRun } from "../formatters/present-run.js";
import { createDoctorGateways } from "../gateways/doctor-gateways.js";
import {
    parseDoctorOptions,
    shouldElicitIntent,
} from "../lib/doctor-options.js";
import type { AmbiguityQuestion } from "../use-cases/detect-ambiguities.js";
import { runDoctor } from "../use-cases/run-doctor.js";

/** Exit code for invalid command-line usage, distinct from blocking findings (1). */
const USAGE_ERROR_EXIT_CODE = 2;

export interface DoctorCommandEnvironment {
    cwd: string;
    stdinIsTty: boolean;
    logger: ConsolaInstance;
    writeStdout(text: string): void;
}

function createConsoleElicitor(logger: ConsolaInstance) {
    return async (questions: AmbiguityQuestion[]): Promise<void> => {
        for (const question of questions) {
            logger.info(`\n${question.hint}`);
            const answer = await logger.prompt(question.question, {
                type: "confirm",
                initial: false,
            });
            if (answer) {
                logger.info("  Noted.");
            }
        }
    };
}

/**
 * The single doctor pipeline shared by every entry point: validate options,
 * run the use case, present the result, and return the exit code.
 */
export async function runDoctorCommand(
    rawArgs: { summary: unknown; format: unknown; ci: unknown },
    environment: DoctorCommandEnvironment,
): Promise<number> {
    const parsed = parseDoctorOptions(rawArgs);
    if (!parsed.success) {
        environment.logger.error(parsed.message);
        return USAGE_ERROR_EXIT_CODE;
    }
    const { options } = parsed;

    const run = await runDoctor(
        { repoPath: resolve(environment.cwd), summaryOnly: options.summary },
        {
            ...createDoctorGateways(environment.logger),
            ...(shouldElicitIntent(options, environment.stdinIsTty)
                ? { elicitIntent: createConsoleElicitor(environment.logger) }
                : {}),
        },
    );

    return presentDoctorRun(run, options.format, {
        logger: environment.logger,
        writeStdout: environment.writeStdout,
    });
}
