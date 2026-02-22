/**
 * Gateway for interacting with GitHub repository rulesets via Octokit.
 * This module provides functionality to check authentication, extract repo info,
 * list rulesets, and create new rulesets using the GitHub REST API.
 * Authentication resolves tokens from environment variables (GH_TOKEN, GITHUB_TOKEN)
 * with a fallback to the GH CLI (`gh auth token`).
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

/**
 * Zod schema for validating GitHub ruleset rule objects from the API
 */
const RulesetRuleSchema = z.object({
    type: z.string(),
    parameters: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Zod schema for validating GitHub ruleset objects from the API
 */
const RulesetSchema = z.object({
    id: z.number(),
    name: z.string(),
    enforcement: z.string(),
    rules: z.array(RulesetRuleSchema).optional(),
});

/**
 * Function signature for executing external commands.
 * Used for local `git` operations that don't go through Octokit.
 */
export type ExecFunction = (
    command: string,
    args: string[],
    options?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Parses a GitHub remote URL to extract owner and repo name.
 * Supports both HTTPS and SSH formats.
 * @param remoteUrl The git remote URL
 * @returns Object with owner and repo, or null if parsing fails
 */
export function parseRepoFromRemoteUrl(
    remoteUrl: string,
): { owner: string; repo: string } | null {
    // Match HTTPS format: https://github.com/owner/repo.git
    const httpsMatch = remoteUrl.match(
        /github\.com\/([\w-]+)\/([\w.-]+?)(?:\.git)?$/,
    );
    if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    // Match SSH format: git@github.com:owner/repo.git
    const sshMatch = remoteUrl.match(
        /github\.com:([\w-]+)\/([\w.-]+?)(?:\.git)?$/,
    );
    if (sshMatch) {
        return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    return null;
}

/**
 * Default exec function that wraps Node.js child_process.execFile.
 * Used only for local git commands.
 */
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
 * Extracts a descriptive error message from an Octokit error,
 * including the HTTP status code when available.
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
 * GitHub ruleset gateway implementation using Octokit.
 * The constructor accepts an Octokit instance (or null if no token is available)
 * and an ExecFunction for local git operations.
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

    /**
     * Checks if the Octokit instance is authenticated by calling the GitHub API.
     * @returns True if authenticated successfully
     */
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

    /**
     * Extracts repository owner and name from the git remote in the target directory
     * @param targetDir The directory containing the git repository
     * @returns Object with owner and repo, or null if not a GitHub repository
     */
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

    /**
     * Lists all rulesets for a repository using Octokit
     * @param owner Repository owner
     * @param repo Repository name
     * @returns Array of rulesets
     * @throws Error if the API call fails or no Octokit instance is available
     */
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

    /**
     * Creates a new ruleset for a repository using Octokit
     * @param owner Repository owner
     * @param repo Repository name
     * @param payload The ruleset configuration to create
     * @throws Error if the API call fails or no Octokit instance is available
     */
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
 * Resolves a GitHub authentication token from environment variables,
 * falling back to `gh auth token` as a last resort.
 * @returns The resolved token, or null if no token is available
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
 * Creates and returns the default GitHub ruleset gateway.
 * Resolves the auth token from environment variables (GH_TOKEN, GITHUB_TOKEN)
 * or falls back to `gh auth token`.
 */
export async function createGitHubRulesetGateway(): Promise<OctokitRulesetGateway> {
    const token = await resolveGitHubToken();
    const octokit = token ? new Octokit({ auth: token }) : null;
    return new OctokitRulesetGateway(octokit);
}
