import { z } from "zod";
import { escapeForTerminal } from "./terminal-escape.js";

const DOCTOR_FORMATS = ["human", "json"] as const;

const DoctorFormatSchema = z.enum(DOCTOR_FORMATS);

export type DoctorFormat = z.infer<typeof DoctorFormatSchema>;

const DEFAULT_FORMAT: DoctorFormat = "human";

const DoctorFlagsSchema = z.object({
    summary: z.boolean(),
    format: z.unknown().optional(),
    ci: z.boolean(),
});

export interface DoctorOptions {
    summary: boolean;
    format: DoctorFormat;
    ci: boolean;
}

export type ParseDoctorOptionsResult =
    | {
          success: true;
          options: DoctorOptions;
          warnings: string[];
          formatFellBack: boolean;
      }
    | { success: false; message: string };

interface ResolvedFormat {
    format: DoctorFormat;
    warnings: string[];
    formatFellBack: boolean;
}

function describeFormatValue(value: unknown): string {
    return typeof value === "string"
        ? `"${escapeForTerminal(value)}"`
        : typeof value;
}

function unsupportedFormatWarning(value: unknown): string {
    return `Unsupported --format ${describeFormatValue(value)}. Accepted values: ${DOCTOR_FORMATS.join(", ")}. Falling back to human output.`;
}

function resolveFormat(rawFormat: unknown): ResolvedFormat {
    const supported = DoctorFormatSchema.safeParse(rawFormat);
    if (supported.success) {
        return {
            format: supported.data,
            warnings: [],
            formatFellBack: false,
        };
    }
    if (rawFormat === undefined) {
        return { format: DEFAULT_FORMAT, warnings: [], formatFellBack: false };
    }
    return {
        format: DEFAULT_FORMAT,
        warnings: [unsupportedFormatWarning(rawFormat)],
        formatFellBack: true,
    };
}

function describeInvalidOptions(error: z.ZodError): string {
    const flags = [
        ...new Set(error.issues.map((issue) => issue.path[0]).filter(isFlag)),
    ].map((flag) => `--${flag}`);
    if (flags.length === 0) {
        return "Invalid doctor options: options must be an object.";
    }
    const noun = flags.length === 1 ? "a boolean" : "booleans";
    return `Invalid doctor options: ${flags.join(" and ")} must be ${noun}.`;
}

function isFlag(key: unknown): key is string {
    return typeof key === "string";
}

export function parseDoctorOptions(raw: unknown): ParseDoctorOptionsResult {
    const flags = DoctorFlagsSchema.safeParse(raw);
    if (!flags.success) {
        return { success: false, message: describeInvalidOptions(flags.error) };
    }
    const resolved = resolveFormat(flags.data.format);
    return {
        success: true,
        options: {
            summary: flags.data.summary,
            format: resolved.format,
            ci: flags.data.ci,
        },
        warnings: resolved.warnings,
        formatFellBack: resolved.formatFellBack,
    };
}

export function shouldElicitIntent(
    options: DoctorOptions,
    stdinIsTty: boolean,
    formatFellBack: boolean,
): boolean {
    return (
        options.format === "human" &&
        !options.ci &&
        stdinIsTty &&
        !formatFellBack
    );
}
