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
