/**
 * Gateway for interacting with GitHub repository rulesets via Octokit.
 * This module provides functionality to check authentication, extract repo info,
 * list rulesets, and create new rulesets using the GitHub REST API.
 * Authentication uses the token provisioned by the GH CLI (`gh auth token`).
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
 * Used for `git` operations that don't go through Octokit.
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
 * Default exec function that wraps Node.js child_process.execFile
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
 * Factory function type for creating Octokit instances.
 * Allows dependency injection for testing.
 */
export type OctokitFactory = (token: string) => Octokit;

/**
 * Default Octokit factory that creates authenticated instances.
 */
function defaultOctokitFactory(token: string): Octokit {
    return new Octokit({ auth: token });
}

/**
 * GitHub ruleset gateway implementation using Octokit.
 * Uses `gh auth token` to obtain the GH CLI token for Octokit authentication
 * and `git remote get-url` for repository information.
 */
export class OctokitRulesetGateway implements RulesetGateway {
    private readonly exec: ExecFunction;
    private readonly createOctokit: OctokitFactory;
    private cachedOctokit: Octokit | null = null;

    constructor(
        exec: ExecFunction = defaultExec,
        createOctokit: OctokitFactory = defaultOctokitFactory,
    ) {
        this.exec = exec;
        this.createOctokit = createOctokit;
    }

    /**
     * Checks if the user is authenticated with the GitHub CLI
     * by attempting to retrieve an auth token.
     * @returns True if a token was retrieved successfully
     */
    async isAuthenticated(): Promise<boolean> {
        try {
            const { stdout } = await this.exec("gh", ["auth", "token"]);
            return stdout.trim().length > 0;
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
     * @throws Error if the API call fails
     */
    async listRulesets(owner: string, repo: string): Promise<Ruleset[]> {
        try {
            const octokit = await this.getOctokit();
            const { data } = await octokit.rest.repos.getRepoRulesets({
                owner,
                repo,
            });
            return z.array(RulesetSchema).parse(data);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(
                `Failed to list rulesets for ${owner}/${repo}: ${message}`,
            );
        }
    }

    /**
     * Creates a new ruleset for a repository using Octokit
     * @param owner Repository owner
     * @param repo Repository name
     * @param payload The ruleset configuration to create
     * @throws Error if the API call fails
     */
    async createRuleset(
        owner: string,
        repo: string,
        payload: RulesetPayload,
    ): Promise<void> {
        try {
            const octokit = await this.getOctokit();
            await octokit.rest.repos.createRepoRuleset({
                owner,
                repo,
                ...payload,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(
                `Failed to create ruleset for ${owner}/${repo}: ${message}`,
            );
        }
    }

    /**
     * Returns a cached or newly created authenticated Octokit instance
     */
    private async getOctokit(): Promise<Octokit> {
        if (this.cachedOctokit) {
            return this.cachedOctokit;
        }
        const { stdout } = await this.exec("gh", ["auth", "token"]);
        const token = stdout.trim();
        if (!token) {
            throw new Error("No authentication token available from GH CLI");
        }
        this.cachedOctokit = this.createOctokit(token);
        return this.cachedOctokit;
    }
}

/**
 * Creates and returns the default GitHub ruleset gateway
 */
export function createGitHubRulesetGateway(): OctokitRulesetGateway {
    return new OctokitRulesetGateway();
}
