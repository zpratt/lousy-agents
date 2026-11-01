import { resolve } from "node:path";
import type { ConsolaInstance } from "consola";
import { presentDoctorRun } from "../formatters/present-run.js";
import { createDoctorGateways } from "../gateways/doctor-gateways.js";
import {
    type DoctorFormat,
    parseDoctorOptions,
    shouldElicitIntent,
} from "../lib/doctor-options.js";
import { runDoctor } from "../use-cases/run-doctor.js";
import {
    createConsoleConfirm,
    createIntentElicitor,
} from "./intent-elicitor.js";

const USAGE_ERROR_EXIT_CODE = 2;
const USAGE_ERROR_LOG_FORMAT: DoctorFormat = "human";

export interface DoctorCommandEnvironment {
    cwd: string;
    stdinIsTty: boolean;
    createLogger(format: DoctorFormat): ConsolaInstance;
    writeStdout(text: string): void;
    confirm?(question: string): Promise<boolean>;
}

/**
 * Runs the shared doctor pipeline and returns the process exit code instead of exiting.
 *
 * Returns `0` when no critical or high defect is found, `1` when one is, and `2` when the
 * options are not an object or `summary` or `ci` is not a boolean. Only a programmatic caller
 * can reach `2`: the `doctor` command line goes through citty, which coerces boolean flags first.
 * An unsupported `format` is not an error; it logs a warning and renders human output.
 */
export async function runDoctorCommand(
    rawArgs: unknown,
    environment: DoctorCommandEnvironment,
): Promise<number> {
    const parsed = parseDoctorOptions(rawArgs);
    if (!parsed.success) {
        environment.createLogger(USAGE_ERROR_LOG_FORMAT).error(parsed.message);
        return USAGE_ERROR_EXIT_CODE;
    }
    const { options } = parsed;
    const logger = environment.createLogger(options.format);
    for (const warning of parsed.warnings) {
        logger.warn(warning);
    }

    const run = await runDoctor(
        { repoPath: resolve(environment.cwd), summaryOnly: options.summary },
        {
            ...createDoctorGateways(logger),
            ...(shouldElicitIntent(
                options,
                environment.stdinIsTty,
                parsed.formatFellBack,
            )
                ? {
                      elicitIntent: createIntentElicitor({
                          logger,
                          confirm:
                              environment.confirm ??
                              createConsoleConfirm(logger),
                      }),
                  }
                : {}),
        },
    );

    return presentDoctorRun(run, options.format, {
        logger,
        writeStdout: environment.writeStdout,
    });
}
