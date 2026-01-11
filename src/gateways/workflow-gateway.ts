/**
 * Gateway for GitHub Actions workflow file operations.
 * This module abstracts file system access for workflow files.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SetupStepCandidate } from "../entities/copilot-setup.js";
import { fileExists } from "./file-system-utils.js";

/**
 * List of setup action patterns to detect in workflows
 */
const SETUP_ACTION_PATTERNS = [
    "actions/setup-node",
    "actions/setup-python",
    "actions/setup-java",
    "actions/setup-go",
    "actions/setup-ruby",
    "jdx/mise-action",
];

/**
 * Interface for workflow gateway
 * Allows for different implementations (file system, mock, etc.)
 */
export interface WorkflowGateway {
    /**
     * Parses all workflow files and extracts setup actions
     * @param targetDir The repository root directory
     * @returns Array of deduplicated setup step candidates
     */
    parseWorkflowsForSetupActions(
        targetDir: string,
    ): Promise<SetupStepCandidate[]>;

    /**
     * Checks if the copilot-setup-steps.yml workflow exists
     * @param targetDir The repository root directory
     * @returns True if the workflow exists
     */
    copilotSetupWorkflowExists(targetDir: string): Promise<boolean>;

    /**
     * Reads and parses the existing copilot-setup-steps.yml workflow
     * @param targetDir The repository root directory
     * @returns The parsed workflow object or null if it doesn't exist
     */
    readCopilotSetupWorkflow(targetDir: string): Promise<unknown | null>;

    /**
     * Writes the Copilot Setup Steps workflow to the repository
     * @param targetDir The repository root directory
     * @param content The workflow YAML content
     */
    writeCopilotSetupWorkflow(
        targetDir: string,
        content: string,
    ): Promise<void>;
}

/**
 * Extracts action name and version from a uses string
 * @example "actions/setup-node@v4" -> { action: "actions/setup-node", version: "v4" }
 */
function parseActionReference(uses: string): {
    action: string;
    version?: string;
} {
    const atIndex = uses.indexOf("@");
    if (atIndex === -1) {
        return { action: uses };
    }
    return {
        action: uses.substring(0, atIndex),
        version: uses.substring(atIndex + 1),
    };
}

/**
 * Checks if an action is a setup action we care about
 */
function isSetupAction(actionName: string): boolean {
    return SETUP_ACTION_PATTERNS.some(
        (pattern) =>
            actionName === pattern || actionName.startsWith(`${pattern}@`),
    );
}

/**
 * Extracts setup step candidates from a parsed workflow
 */
function extractSetupStepsFromWorkflow(
    workflow: unknown,
): SetupStepCandidate[] {
    const candidates: SetupStepCandidate[] = [];

    if (!workflow || typeof workflow !== "object") {
        return candidates;
    }

    const workflowObj = workflow as Record<string, unknown>;
    const jobs = workflowObj.jobs;

    if (!jobs || typeof jobs !== "object") {
        return candidates;
    }

    for (const job of Object.values(jobs as Record<string, unknown>)) {
        if (!job || typeof job !== "object") {
            continue;
        }

        const jobObj = job as Record<string, unknown>;
        const steps = jobObj.steps;

        if (!Array.isArray(steps)) {
            continue;
        }

        for (const step of steps) {
            if (!step || typeof step !== "object") {
                continue;
            }

            const stepObj = step as Record<string, unknown>;
            const uses = stepObj.uses;

            if (typeof uses !== "string") {
                continue;
            }

            const { action, version } = parseActionReference(uses);

            if (isSetupAction(action)) {
                // Extract 'with' configuration
                const withConfig = stepObj.with;
                const config =
                    withConfig && typeof withConfig === "object"
                        ? (withConfig as Record<string, unknown>)
                        : undefined;

                candidates.push({
                    action,
                    version,
                    config,
                    source: "workflow",
                });
            }
        }
    }

    return candidates;
}

/**
 * File system implementation of the workflow gateway
 */
export class FileSystemWorkflowGateway implements WorkflowGateway {
    async parseWorkflowsForSetupActions(
        targetDir: string,
    ): Promise<SetupStepCandidate[]> {
        const workflowsDir = join(targetDir, ".github", "workflows");

        if (!(await fileExists(workflowsDir))) {
            return [];
        }

        const files = await readdir(workflowsDir);
        const yamlFiles = files.filter(
            (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
        );

        const allCandidates: SetupStepCandidate[] = [];

        for (const file of yamlFiles) {
            const filePath = join(workflowsDir, file);
            try {
                const content = await readFile(filePath, "utf-8");
                const workflow = parseYaml(content);
                const candidates = extractSetupStepsFromWorkflow(workflow);
                allCandidates.push(...candidates);
            } catch {
                // Skip files that can't be parsed as valid YAML workflows
                // This is expected for malformed or non-workflow YAML files
            }
        }

        // Deduplicate by action name, keeping the first occurrence (which may have config)
        const seen = new Set<string>();
        const deduplicated: SetupStepCandidate[] = [];

        for (const candidate of allCandidates) {
            if (!seen.has(candidate.action)) {
                seen.add(candidate.action);
                deduplicated.push(candidate);
            }
        }

        return deduplicated;
    }

    async copilotSetupWorkflowExists(targetDir: string): Promise<boolean> {
        const workflowPath = join(
            targetDir,
            ".github",
            "workflows",
            "copilot-setup-steps.yml",
        );
        return fileExists(workflowPath);
    }

    async readCopilotSetupWorkflow(targetDir: string): Promise<unknown | null> {
        const workflowPath = join(
            targetDir,
            ".github",
            "workflows",
            "copilot-setup-steps.yml",
        );

        if (!(await fileExists(workflowPath))) {
            return null;
        }

        const content = await readFile(workflowPath, "utf-8");
        return parseYaml(content);
    }

    async writeCopilotSetupWorkflow(
        targetDir: string,
        content: string,
    ): Promise<void> {
        const workflowPath = join(
            targetDir,
            ".github",
            "workflows",
            "copilot-setup-steps.yml",
        );
        await writeFile(workflowPath, content, "utf-8");
    }
}

/**
 * Creates and returns the default workflow gateway
 */
export function createWorkflowGateway(): WorkflowGateway {
    return new FileSystemWorkflowGateway();
}
