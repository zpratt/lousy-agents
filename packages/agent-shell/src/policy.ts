import { isAbsolute, join } from "node:path";
import { isWithinProjectRoot } from "./path-utils.js";
import { type PolicyConfig, PolicyConfigSchema } from "./types.js";

export interface PolicyDeps {
    realpath: (path: string) => Promise<string>;
    readFile: (path: string, encoding: string) => Promise<string>;
    getRepositoryRoot: () => string;
}

export interface PolicyDecision {
    decision: "allow" | "deny";
    matchedRule: string | null;
}

const DEFAULT_POLICY_SUBPATH = ".github/hooks/agent-shell/policy.json";

/**
 * Glob matcher supporting only `*` wildcards.
 *
 * Splits the rule on `*` into literal segments and checks that each
 * segment appears in the command in order. O(n·m) worst case where
 * n = command length and m = rule length, with no exponential
 * backtracking (unlike regex `.*` quantifiers).
 */
function matchesRule(command: string, rule: string): boolean {
    const segments = rule.split("*");

    if (segments.length === 1) {
        return command === rule;
    }

    const prefixSegment = segments[0];
    const suffixSegment = segments[segments.length - 1];
    const innerSegments = segments.slice(1, -1);

    if (!command.startsWith(prefixSegment)) {
        return false;
    }

    let cursor = prefixSegment.length;

    for (const segment of innerSegments) {
        const index = command.indexOf(segment, cursor);
        if (index === -1) {
            return false;
        }
        cursor = index + segment.length;
    }

    const suffixStart = command.length - suffixSegment.length;
    return suffixStart >= cursor && command.endsWith(suffixSegment);
}

export function evaluatePolicy(
    policy: PolicyConfig | null,
    command: string,
): PolicyDecision {
    if (policy === null) {
        return { decision: "allow", matchedRule: null };
    }

    const trimmed = command.trim();

    for (const rule of policy.deny) {
        if (matchesRule(trimmed, rule)) {
            return { decision: "deny", matchedRule: rule };
        }
    }

    if (policy.allow !== undefined) {
        const matchesAny = policy.allow.some((rule) =>
            matchesRule(trimmed, rule),
        );
        if (!matchesAny) {
            return { decision: "deny", matchedRule: null };
        }
    }

    return { decision: "allow", matchedRule: null };
}

/**
 * Escapes ASCII control characters in a path before embedding it in an error
 * message. Prevents log/terminal injection when the path originates from an
 * environment variable (e.g. AGENTSHELL_POLICY_PATH).
 */
function sanitizePath(path: string): string {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control characters for sanitization
    return path.replace(/[\u0000-\u001f\u007f]/g, (ch) => {
        return `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;
    });
}

function isEnoent(error: unknown): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        ((error as Error & { code: string }).code === "ENOENT" ||
            (error as Error & { code: string }).code === "ENOTDIR")
    );
}

function resolvePolicyPath(
    env: Record<string, string | undefined>,
    repoRoot: string,
): { path: string; isOverride: boolean } {
    const override = env.AGENTSHELL_POLICY_PATH;

    if (override !== undefined && override !== "") {
        if (isAbsolute(override)) {
            // Absolute path — use as-is (will be validated after realpath)
            return { path: override, isOverride: true };
        }
        // Relative path — resolve relative to repo root
        return { path: join(repoRoot, override), isOverride: true };
    }

    return { path: join(repoRoot, DEFAULT_POLICY_SUBPATH), isOverride: false };
}

export async function loadPolicy(
    env: Record<string, string | undefined>,
    deps: PolicyDeps,
): Promise<PolicyConfig | null> {
    const rawRepoRoot = deps.getRepositoryRoot();
    const repoRoot = await deps.realpath(rawRepoRoot);
    const { path: candidatePath, isOverride } = resolvePolicyPath(
        env,
        repoRoot,
    );

    let resolvedPath: string;
    try {
        resolvedPath = await deps.realpath(candidatePath);
    } catch (error: unknown) {
        if (isEnoent(error)) {
            if (isOverride) {
                throw new Error(
                    `Policy override path does not exist: ${sanitizePath(candidatePath)}`,
                );
            }
            return null;
        }
        throw error;
    }

    if (!isWithinProjectRoot(resolvedPath, repoRoot)) {
        throw new Error(
            `Policy file path resolves outside the repository root: ${sanitizePath(resolvedPath)}`,
        );
    }

    let content: string;
    try {
        content = await deps.readFile(resolvedPath, "utf-8");
    } catch (error: unknown) {
        if (isEnoent(error)) {
            if (isOverride) {
                throw new Error(
                    `Policy override path does not exist: ${sanitizePath(resolvedPath)}`,
                );
            }
            return null;
        }
        throw error;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error(
            `Invalid JSON in policy file ${sanitizePath(resolvedPath)}: file exists but contains malformed JSON`,
        );
    }

    return PolicyConfigSchema.parse(parsed);
}
