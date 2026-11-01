import { z } from "zod";
import { GateError } from "./gate-error.js";
import {
    firstIssueError,
    mustBeNonEmptyText,
    mustBeObject,
} from "./zod-issues.js";

const SUPPORTED_REPORT_SCHEMA_VERSION = "2";

export interface CoachSignal {
    readonly ruleId: string;
    readonly path: string;
    readonly lifecycle: string;
    /** The import behind an architecture finding, when coach says which */
    readonly importer?: string;
    readonly importee?: string;
    readonly forbiddenPair?: string;
}

export interface CoachReport {
    readonly signals: readonly CoachSignal[];
}

const nonEmptyText = z
    .string({ error: mustBeNonEmptyText })
    .min(1, { error: mustBeNonEmptyText });

const optionalText = z.string().min(1).optional().catch(undefined);

// Evidence only improves the message, so anything unexpected in it is ignored.
const evidenceSchema = z
    .object({
        importer: optionalText,
        importee: optionalText,
        rule: optionalText,
    })
    .catch({});

const signalSchema = z
    .object(
        {
            // biome-ignore lint/style/useNamingConvention: coach's report format
            rule_id: nonEmptyText,
            path: nonEmptyText,
            lifecycle: nonEmptyText,
            // biome-ignore lint/style/useNamingConvention: coach's report format
            machine_evidence: evidenceSchema,
        },
        mustBeObject("signal"),
    )
    .transform(
        (signal): CoachSignal => ({
            ruleId: signal.rule_id,
            path: signal.path,
            lifecycle: signal.lifecycle,
            importer: signal.machine_evidence.importer,
            importee: signal.machine_evidence.importee,
            forbiddenPair: signal.machine_evidence.rule,
        }),
    );

const reportSchema = z
    .object(
        {
            // biome-ignore lint/style/useNamingConvention: coach's report format
            schema_version: z.literal(SUPPORTED_REPORT_SCHEMA_VERSION, {
                error: `coach report schema_version must be "${SUPPORTED_REPORT_SCHEMA_VERSION}"`,
            }),
            signals: z.array(signalSchema, {
                error: "coach report signals must be an array",
            }),
        },
        { error: "coach report must be a JSON object" },
    )
    .transform((report): CoachReport => ({ signals: report.signals }));

function parseJson(stdout: string): unknown {
    if (stdout.trim() === "") {
        throw new GateError("coach printed nothing on stdout");
    }
    try {
        return JSON.parse(stdout);
    } catch {
        throw new GateError("coach stdout is not valid JSON");
    }
}

/**
 * Reads the parts of coach's JSON report the gate relies on. Anything missing
 * or unexpected is an error: a report the gate cannot read is not a pass.
 */
export function parseCoachReport(stdout: string): CoachReport {
    const result = reportSchema.safeParse(parseJson(stdout));
    if (!result.success) {
        throw firstIssueError(result.error);
    }
    return result.data;
}
