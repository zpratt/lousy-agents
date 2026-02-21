/**
 * Gateway for interacting with GitHub repository rulesets via the GH CLI.
 * This module provides functionality to check authentication, extract repo info,
 * list rulesets, and create new rulesets.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Ruleset } from "../entities/copilot-setup.js";
import type {
    RulesetGateway,
    RulesetPayload,
} from "../use-cases/check-copilot-review-ruleset.js";

const execFileAsync = promisify(execFile);

/**
 * Function signature for executing external commands.
 * Allows dependency injection for testing.
 */
export type ExecFunction = (
    command: string,
    args: string[],
    options?: { input?: string; cwd?: string },
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
        /github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/,
    );
    if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    // Match SSH format: git@github.com:owner/repo.git
    const sshMatch = remoteUrl.match(
        /github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/,
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
    options?: { input?: string; cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(command, args, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        input: options?.input,
        cwd: options?.cwd,
    });
}

/**
 * GitHub ruleset gateway implementation using the GH CLI.
 * Uses `gh auth status` for authentication checking and `gh api` for API calls.
 */
export class GhCliRulesetGateway implements RulesetGateway {
    private readonly exec: ExecFunction;

    constructor(exec: ExecFunction = defaultExec) {
        this.exec = exec;
    }

    /**
     * Checks if the user is authenticated with the GitHub CLI
     * @returns True if authenticated
     */
    async isAuthenticated(): Promise<boolean> {
        try {
            await this.exec("gh", ["auth", "status"]);
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
     * Lists all rulesets for a repository
     * @param owner Repository owner
     * @param repo Repository name
     * @returns Array of rulesets
     * @throws Error if the API call fails
     */
    async listRulesets(owner: string, repo: string): Promise<Ruleset[]> {
        try {
            const { stdout } = await this.exec("gh", [
                "api",
                `repos/${owner}/${repo}/rulesets`,
                "--paginate",
            ]);
            const data: unknown = JSON.parse(stdout);
            if (!Array.isArray(data)) {
                return [];
            }
            return data as Ruleset[];
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(
                `Failed to list rulesets for ${owner}/${repo}: ${message}`,
            );
        }
    }

    /**
     * Creates a new ruleset for a repository
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
            await this.exec(
                "gh",
                [
                    "api",
                    `repos/${owner}/${repo}/rulesets`,
                    "-X",
                    "POST",
                    "--input",
                    "-",
                ],
                { input: JSON.stringify(payload) },
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(
                `Failed to create ruleset for ${owner}/${repo}: ${message}`,
            );
        }
    }
}

/**
 * Creates and returns the default GitHub ruleset gateway
 */
export function createGitHubRulesetGateway(): GhCliRulesetGateway {
    return new GhCliRulesetGateway();
}
