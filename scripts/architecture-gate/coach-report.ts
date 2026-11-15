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

/** How many of the files coach analyzed at HEAD no declared layer claims. */
export interface LayerMembership {
    readonly analyzedFiles: number;
    readonly filesOutsideLayers: number;
}

export interface CoachDiagnostic {
    readonly kind: string;
    readonly path?: string;
    readonly message: string;
}

export interface CoachReport {
    readonly signals: readonly CoachSignal[];
    readonly layerMembership: LayerMembership;
    readonly diagnostics: readonly CoachDiagnostic[];
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

function mustBeWholeNumber(issue: { readonly path?: readonly PropertyKey[] }) {
    const field = String(issue.path?.at(-1) ?? "value");
    return `layer_membership.head.${field} must be a whole number of files`;
}

const fileCount = z
    .number({ error: mustBeWholeNumber })
    .int({ error: mustBeWholeNumber })
    .nonnegative({ error: mustBeWholeNumber });

const layerMembershipSchema = z.object(
    {
        head: z
            .object(
                {
                    // biome-ignore lint/style/useNamingConvention: coach's report format
                    analyzed_files: fileCount,
                    // biome-ignore lint/style/useNamingConvention: coach's report format
                    files_outside_layers: fileCount,
                },
                mustBeObject("layer_membership.head"),
            )
            .refine(
                (head) => head.files_outside_layers <= head.analyzed_files,
                {
                    error: "layer_membership.head.files_outside_layers cannot exceed analyzed_files",
                },
            ),
    },
    mustBeObject("layer_membership"),
);

const diagnosticSchema = z
    .object(
        {
            kind: nonEmptyText,
            path: optionalText,
            message: z.string().catch(""),
        },
        mustBeObject("diagnostic"),
    )
    .transform(
        (diagnostic): CoachDiagnostic => ({
            kind: diagnostic.kind,
            path: diagnostic.path,
            message: diagnostic.message,
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
            // biome-ignore lint/style/useNamingConvention: coach's report format
            layer_membership: layerMembershipSchema,
            diagnostics: z.array(diagnosticSchema, {
                error: "coach report diagnostics must be an array",
            }),
        },
        { error: "coach report must be a JSON object" },
    )
    .transform(
        (report): CoachReport => ({
            signals: report.signals,
            layerMembership: {
                analyzedFiles: report.layer_membership.head.analyzed_files,
                filesOutsideLayers:
                    report.layer_membership.head.files_outside_layers,
            },
            diagnostics: report.diagnostics,
        }),
    );

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
