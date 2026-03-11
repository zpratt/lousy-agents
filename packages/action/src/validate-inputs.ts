/**
 * Input validation for the GitHub Action.
 * Validates environment-variable inputs before lint execution.
 */

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

/** Allowed values for the reviewdog reporter input */
const VALID_REPORTERS = [
    "github-pr-check",
    "github-pr-review",
    "github-check",
] as const;

/** Allowed values for the reviewdog filter_mode input */
const VALID_FILTER_MODES = [
    "added",
    "diff_context",
    "file",
    "nofilter",
] as const;

/** Allowed values for the reviewdog level input */
const VALID_LEVELS = ["info", "warning", "error"] as const;

export type Reporter = (typeof VALID_REPORTERS)[number];
export type FilterMode = (typeof VALID_FILTER_MODES)[number];
export type Level = (typeof VALID_LEVELS)[number];

/** Validated action inputs */
export interface ActionInputs {
    readonly directory: string;
    readonly skills: boolean;
    readonly agents: boolean;
    readonly instructions: boolean;
    readonly reporter: Reporter;
    readonly filterMode: FilterMode;
    readonly level: Level;
}

const ReporterSchema = z.enum(VALID_REPORTERS);
const FilterModeSchema = z.enum(VALID_FILTER_MODES);
const LevelSchema = z.enum(VALID_LEVELS);

/**
 * Characters allowed in directory paths: alphanumeric, dots, hyphens, underscores, slashes.
 */
const SAFE_DIRECTORY_PATTERN = /^[a-zA-Z0-9_./-]+$/;

/**
 * Validates and sanitizes the directory input.
 * Rejects empty strings, absolute paths, home-relative paths, path traversal, special values,
 * and paths that don't exist or aren't directories on disk.
 */
export async function validateDirectory(directory: string): Promise<string> {
    if (!directory || directory.trim().length === 0) {
        throw new Error(
            "directory input must not be empty. Provide a relative path within the workspace.",
        );
    }

    if (!SAFE_DIRECTORY_PATTERN.test(directory)) {
        throw new Error(
            `directory input must be a relative path within the workspace: ${directory}`,
        );
    }

    if (directory.includes("..")) {
        throw new Error(
            `directory input must be a relative path within the workspace: ${directory}`,
        );
    }

    if (directory.startsWith("/")) {
        throw new Error(
            `directory input must be a relative path within the workspace: ${directory}`,
        );
    }

    if (directory.startsWith("~")) {
        throw new Error(
            `directory input must be a relative path within the workspace: ${directory}`,
        );
    }

    if (directory === "-") {
        throw new Error(
            `directory input must be a relative path within the workspace: ${directory}`,
        );
    }

    const resolved = resolve(directory);

    try {
        const stats = await stat(resolved);
        if (!stats.isDirectory()) {
            throw new Error(`directory input is not a directory: ${directory}`);
        }
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.startsWith("directory input")
        ) {
            throw error;
        }
        throw new Error(`directory input does not exist: ${directory}`);
    }

    return resolved;
}

/**
 * Validates the reporter input against the allowed values.
 */
export function validateReporter(reporter: string): Reporter {
    const result = ReporterSchema.safeParse(reporter);
    if (!result.success) {
        throw new Error(
            `invalid reporter: ${reporter}. Must be github-pr-check, github-pr-review, or github-check.`,
        );
    }
    return result.data;
}

/**
 * Validates the filter_mode input against the allowed values.
 */
export function validateFilterMode(filterMode: string): FilterMode {
    const result = FilterModeSchema.safeParse(filterMode);
    if (!result.success) {
        throw new Error(
            `invalid filter_mode: ${filterMode}. Must be added, diff_context, file, or nofilter.`,
        );
    }
    return result.data;
}

/**
 * Validates the level input against the allowed values.
 */
export function validateLevel(level: string): Level {
    const result = LevelSchema.safeParse(level);
    if (!result.success) {
        throw new Error(
            `invalid level: ${level}. Must be info, warning, or error.`,
        );
    }
    return result.data;
}

/**
 * Reads and validates all action inputs from environment variables.
 */
export async function readActionInputs(
    env: Record<string, string | undefined>,
): Promise<ActionInputs> {
    const directory = await validateDirectory(env.INPUT_DIRECTORY ?? ".");
    const reporter = validateReporter(env.INPUT_REPORTER ?? "github-pr-check");
    const filterMode = validateFilterMode(env.INPUT_FILTER_MODE ?? "added");
    const level = validateLevel(env.INPUT_LEVEL ?? "info");

    const skills = env.INPUT_SKILLS?.toLowerCase() === "true";
    const agents = env.INPUT_AGENTS?.toLowerCase() === "true";
    const instructions = env.INPUT_INSTRUCTIONS?.toLowerCase() === "true";

    return {
        directory,
        skills,
        agents,
        instructions,
        reporter,
        filterMode,
        level,
    };
}
