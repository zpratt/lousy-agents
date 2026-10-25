import { z } from "zod";

const DOCTOR_FORMATS = ["human", "json"] as const;

const DoctorOptionsSchema = z.object({
    summary: z.boolean(),
    format: z.enum(DOCTOR_FORMATS),
    ci: z.boolean(),
});

export type DoctorOptions = z.infer<typeof DoctorOptionsSchema>;
export type DoctorFormat = DoctorOptions["format"];

export type ParseDoctorOptionsResult =
    | { success: true; options: DoctorOptions }
    | { success: false; message: string };

function describeFormatValue(value: unknown): string {
    return typeof value === "string" ? JSON.stringify(value) : typeof value;
}

/**
 * Validates raw CLI arguments. An unsupported `--format` is a usage error,
 * never a silent fallback to human output.
 */
export function parseDoctorOptions(raw: {
    summary: unknown;
    format: unknown;
    ci: unknown;
}): ParseDoctorOptionsResult {
    const result = DoctorOptionsSchema.safeParse(raw);
    if (result.success) {
        return { success: true, options: result.data };
    }
    const formatIssue = result.error.issues.some(
        (issue) => issue.path[0] === "format",
    );
    return {
        success: false,
        message: formatIssue
            ? `Unsupported --format ${describeFormatValue(raw.format)}. Use one of: ${DOCTOR_FORMATS.join(", ")}.`
            : "Invalid doctor options.",
    };
}

/**
 * Interactive questions are only ever asked for human output on a TTY
 * without --ci. JSON output never prompts, so stdout stays one JSON value.
 */
export function shouldElicitIntent(
    options: DoctorOptions,
    stdinIsTty: boolean,
): boolean {
    return options.format === "human" && !options.ci && stdinIsTty;
}
