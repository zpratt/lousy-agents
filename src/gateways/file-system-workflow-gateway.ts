/**
 * File system implementation of the workflow gateway.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SetupStepCandidate } from "../entities/copilot-setup.js";
import {
    type CopilotSetupConfig,
    loadCopilotSetupConfig,
} from "../lib/copilot-setup-config.js";
import {
    deduplicateCandidates,
    extractSetupStepsFromWorkflow,
} from "../use-cases/setup-step-discovery.js";
import { fileExists } from "./file-system-utils.js";
import type { WorkflowGateway } from "./workflow-gateway.js";

/**
 * Possible filenames for the Copilot Setup Steps workflow.
 * Supports both .yml and .yaml extensions.
 */
const COPILOT_SETUP_WORKFLOW_FILENAMES = [
    "copilot-setup-steps.yml",
    "copilot-setup-steps.yaml",
];

/**
 * File system implementation of the workflow gateway
 */
export class FileSystemWorkflowGateway implements WorkflowGateway {
    private config: CopilotSetupConfig | null = null;

    private async getConfig(): Promise<CopilotSetupConfig> {
        if (!this.config) {
            this.config = await loadCopilotSetupConfig();
        }
        return this.config;
    }

    /**
     * Finds the path to an existing Copilot Setup Steps workflow file.
     * @returns The full path if found, or null if no workflow exists.
     */
    private async findCopilotSetupWorkflowPath(
        targetDir: string,
    ): Promise<string | null> {
        const workflowsDir = join(targetDir, ".github", "workflows");
        for (const filename of COPILOT_SETUP_WORKFLOW_FILENAMES) {
            const workflowPath = join(workflowsDir, filename);
            if (await fileExists(workflowPath)) {
                return workflowPath;
            }
        }
        return null;
    }

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

        const config = await this.getConfig();
        const allCandidates: SetupStepCandidate[] = [];

        for (const file of yamlFiles) {
            const filePath = join(workflowsDir, file);
            try {
                const content = await readFile(filePath, "utf-8");
                const workflow = parseYaml(content);
                const candidates = extractSetupStepsFromWorkflow(
                    workflow,
                    config.setupActionPatterns,
                );
                allCandidates.push(...candidates);
            } catch {
                // Skip files that can't be parsed as valid YAML workflows
                // This is expected for malformed or non-workflow YAML files
            }
        }

        return deduplicateCandidates(allCandidates);
    }

    async copilotSetupWorkflowExists(targetDir: string): Promise<boolean> {
        const workflowPath = await this.findCopilotSetupWorkflowPath(targetDir);
        return workflowPath !== null;
    }

    async getCopilotSetupWorkflowPath(targetDir: string): Promise<string> {
        const existingPath = await this.findCopilotSetupWorkflowPath(targetDir);
        return (
            existingPath ||
            join(targetDir, ".github", "workflows", "copilot-setup-steps.yml")
        );
    }

    async readCopilotSetupWorkflow(targetDir: string): Promise<unknown | null> {
        const workflowPath = await this.findCopilotSetupWorkflowPath(targetDir);

        if (!workflowPath) {
            return null;
        }

        const content = await readFile(workflowPath, "utf-8");
        return parseYaml(content);
    }

    async writeCopilotSetupWorkflow(
        targetDir: string,
        content: string,
    ): Promise<void> {
        // Check if an existing workflow file exists (either extension)
        const existingPath = await this.findCopilotSetupWorkflowPath(targetDir);

        // Use existing path if found, otherwise default to .yml
        const workflowPath =
            existingPath ||
            join(targetDir, ".github", "workflows", "copilot-setup-steps.yml");

        await writeFile(workflowPath, content, "utf-8");
    }
}

/**
 * Creates and returns the default workflow gateway
 */
export function createWorkflowGateway(): WorkflowGateway {
    return new FileSystemWorkflowGateway();
}
