import { execSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Function that executes the git command and returns its stdout.
 * Accepts the sanitized environment to use for the subprocess.
 */
export type GitCommandExecutor = (
    env: Record<string, string | undefined>,
) => string;

const MAX_ERROR_OUTPUT_LENGTH = 200;

const GIT_ENV_VARS_TO_SANITIZE = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_SYSTEM",
    "GIT_CONFIG_NOSYSTEM",
] as const;

function sanitizeGitEnv(
    env: Record<string, string | undefined>,
): Record<string, string | undefined> {
    const sanitized = { ...env };
    for (const key of GIT_ENV_VARS_TO_SANITIZE) {
        delete sanitized[key];
    }
    return sanitized;
}

function defaultExecutor(env: Record<string, string | undefined>): string {
    return execSync("git rev-parse --show-toplevel", {
        env,
        encoding: "utf-8",
    });
}

/**
 * Creates a `getRepositoryRoot` function that discovers the git repository
 * root using `git rev-parse --show-toplevel`. The result is cached per
 * instance to avoid repeated subprocess calls.
 *
 * @param executor - Function to execute the git command (injectable for testing)
 * @param env - Base environment variables (injectable for testing)
 */
export function createGetRepositoryRoot(
    executor: GitCommandExecutor = defaultExecutor,
    env: Record<string, string | undefined> = process.env,
): () => string {
    let cachedRoot: string | undefined;

    return (): string => {
        if (cachedRoot !== undefined) {
            return cachedRoot;
        }

        const sanitizedEnv = sanitizeGitEnv(env);

        let output: string;
        try {
            output = executor(sanitizedEnv).trim();
        } catch {
            throw new Error(
                "Failed to discover repository root. Ensure this is a git repository and git is installed.",
            );
        }

        if (!output || !output.startsWith("/")) {
            throw new Error(
                `Expected an absolute path from git but received: ${output.slice(0, MAX_ERROR_OUTPUT_LENGTH)}`,
            );
        }

        if (/[\n\r]/.test(output)) {
            throw new Error(
                "Repository root path contains unexpected control characters.",
            );
        }

        // Normalize path to collapse traversal sequences like /a/../b
        const resolved = resolve(output);

        cachedRoot = resolved;
        return cachedRoot;
    };
}

/** Process-scoped singleton for production use. */
export const getRepositoryRoot: () => string = createGetRepositoryRoot();
