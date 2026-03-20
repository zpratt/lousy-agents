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
 * Splits the rule on `*` into literal segments, then verifies:
 *   - the first segment matches the start of the command (prefix)
 *   - the last segment matches the end of the command (suffix)
 *   - each remaining segment appears left-to-right in between
 * This runs in O(n·m) time and avoids the exponential backtracking
 * that regex `.*` quantifiers can cause.
 */
function matchesRule(command: string, rule: string): boolean {
    const segments = rule.split("*");

    if (segments.length === 1) {
        return command === rule;
    }

    const prefix = segments[0];
    const suffix = segments[segments.length - 1];

    // Guard against overlapping prefix and suffix (e.g. rule="a*a", command="a")
    if (prefix.length + suffix.length > command.length) {
        return false;
    }

    if (!command.startsWith(prefix) || !command.endsWith(suffix)) {
        return false;
    }

    let pos = prefix.length;
    const limit = command.length - suffix.length;
    for (let i = 1; i < segments.length - 1; i++) {
        const segment = segments[i];
        const idx = command.indexOf(segment, pos);
        if (idx === -1 || idx + segment.length > limit) return false;
        pos = idx + segment.length;
    }

    return true;
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

function isEnoent(error: unknown): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        (error as Error & { code: string }).code === "ENOENT"
    );
}

function resolvePolicyPath(
    env: Record<string, string | undefined>,
    repoRoot: string,
): string {
    const override = env.AGENTSHELL_POLICY_PATH;

    if (override !== undefined && override !== "") {
        if (isAbsolute(override)) {
            // Absolute path — use as-is (will be validated after realpath)
            return override;
        }
        // Relative path — resolve relative to repo root
        return join(repoRoot, override);
    }

    return join(repoRoot, DEFAULT_POLICY_SUBPATH);
}

export async function loadPolicy(
    env: Record<string, string | undefined>,
    deps: PolicyDeps,
): Promise<PolicyConfig | null> {
    const rawRepoRoot = deps.getRepositoryRoot();
    const repoRoot = await deps.realpath(rawRepoRoot);
    const candidatePath = resolvePolicyPath(env, repoRoot);

    let resolvedPath: string;
    try {
        resolvedPath = await deps.realpath(candidatePath);
    } catch (error: unknown) {
        if (isEnoent(error)) {
            return null;
        }
        throw error;
    }

    if (!isWithinProjectRoot(resolvedPath, repoRoot)) {
        throw new Error(
            `Policy file path resolves outside the repository root: ${resolvedPath}`,
        );
    }

    let content: string;
    try {
        content = await deps.readFile(resolvedPath, "utf-8");
    } catch (error: unknown) {
        if (isEnoent(error)) {
            return null;
        }
        throw error;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error(
            `Invalid JSON in policy file ${resolvedPath}: file exists but contains malformed JSON`,
        );
    }

    return PolicyConfigSchema.parse(parsed);
}
