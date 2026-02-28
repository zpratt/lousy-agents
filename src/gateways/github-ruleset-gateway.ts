/**
 * Gateway for interacting with GitHub repository rulesets via Octokit.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import type { Ruleset } from "../entities/copilot-setup.js";
import type {
    RulesetGateway,
    RulesetPayload,
} from "../use-cases/check-copilot-review-ruleset.js";

const execFileAsync = promisify(execFile);

const RulesetRuleSchema = z.object({
    type: z.string(),
    parameters: z.record(z.string(), z.unknown()).optional(),
});

const RulesetSchema = z.object({
    id: z.number(),
    name: z.string(),
    enforcement: z.string(),
    rules: z.array(RulesetRuleSchema).optional(),
});

export type ExecFunction = (
    command: string,
    args: string[],
    options?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Parses a GitHub remote URL to extract owner and repo name
 */
export function parseRepoFromRemoteUrl(
    remoteUrl: string,
): { owner: string; repo: string } | null {
    const httpsMatch = remoteUrl.match(
        /github\.com\/([\w-]+)\/([\w.-]+?)(?:\.git)?$/,
    );
    if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    const sshMatch = remoteUrl.match(
        /github\.com:([\w-]+)\/([\w.-]+?)(?:\.git)?$/,
    );
    if (sshMatch) {
        return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    return null;
}

function defaultExec(
    command: string,
    args: string[],
    options?: { cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(command, args, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        cwd: options?.cwd,
    });
}

/**
 * Extracts a descriptive error message from an Octokit error, including HTTP status when available
 */
function formatOctokitError(error: unknown): string {
    const message = error instanceof Error ? error.message : "";
    const status =
        error instanceof Object && "status" in error
            ? (error as { status: unknown }).status
            : undefined;

    const parts: string[] = [];
    if (typeof status === "number") {
        parts.push(`status ${status}`);
    }
    if (message) {
        parts.push(message);
    }
    return parts.length > 0 ? parts.join(" - ") : "Unknown error";
}

/**
 * GitHub ruleset gateway implementation using Octokit
 */
export class OctokitRulesetGateway implements RulesetGateway {
    private readonly octokit: Octokit | null;
    private readonly exec: ExecFunction;

    constructor(
        octokit: Octokit | null = null,
        exec: ExecFunction = defaultExec,
    ) {
        this.octokit = octokit;
        this.exec = exec;
    }

    async isAuthenticated(): Promise<boolean> {
        if (!this.octokit) {
            return false;
        }
        try {
            await this.octokit.rest.users.getAuthenticated();
            return true;
        } catch {
            return false;
        }
    }

    async getRepoInfo(
        targetDir: string,
    ): Promise<{ owner: string; repo: string } | null> {
        try {
            const { stdout } = await this.exec(
                "git",
                ["remote", "get-url", "origin"],
                { cwd: targetDir },
            );
            return parseRepoFromRemoteUrl(stdout.trim());
        } catch {
            return null;
        }
    }

    async hasAdvancedSecurity(
        owner: string,
        repo: string,
    ): Promise<boolean> {
        if (!this.octokit) {
            return false;
        }
        try {
            const { data } = await this.octokit.rest.repos.get({ owner, repo });
            const securityAnalysis = (
                data as {
                    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                    security_and_analysis?: {
                        // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                        advanced_security?: { status: string };
                    };
                }
            ).security_and_analysis;
            return securityAnalysis?.advanced_security?.status === "enabled";
        } catch {
            return false;
        }
    }

    async listRulesets(owner: string, repo: string): Promise<Ruleset[]> {
        if (!this.octokit) {
            throw new Error("Not authenticated");
        }
        try {
            const { data } = await this.octokit.rest.repos.getRepoRulesets({
                owner,
                repo,
            });
            return z.array(RulesetSchema).parse(data);
        } catch (error) {
            const details = formatOctokitError(error);
            throw new Error(
                `Failed to list rulesets for ${owner}/${repo}: ${details}`,
            );
        }
    }

    async createRuleset(
        owner: string,
        repo: string,
        payload: RulesetPayload,
    ): Promise<void> {
        if (!this.octokit) {
            throw new Error("Not authenticated");
        }
        try {
            await this.octokit.rest.repos.createRepoRuleset({
                owner,
                repo,
                ...payload,
            });
        } catch (error) {
            const details = formatOctokitError(error);
            throw new Error(
                `Failed to create ruleset for ${owner}/${repo}: ${details}`,
            );
        }
    }
}

/**
 * Resolves a GitHub token from GH_TOKEN/GITHUB_TOKEN env vars, with gh CLI fallback
 */
export async function resolveGitHubToken(): Promise<string | null> {
    const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (envToken) {
        return envToken;
    }

    try {
        const { stdout } = await execFileAsync("gh", ["auth", "token"], {
            encoding: "utf-8",
        });
        const token = stdout.trim();
        return token || null;
    } catch {
        return null;
    }
}

/**
 * Creates the default GitHub ruleset gateway with resolved auth token
 */
export async function createGitHubRulesetGateway(): Promise<OctokitRulesetGateway> {
    const token = await resolveGitHubToken();
    const octokit = token ? new Octokit({ auth: token }) : null;
    return new OctokitRulesetGateway(octokit);
}
