/**
 * File system implementation of the workflow gateway.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
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
import {
    assertFileSizeWithinLimit,
    fileExists,
    resolveSafePath,
} from "./file-system-utils.js";
import type { WorkflowGateway } from "./workflow-gateway.js";

const COPILOT_SETUP_WORKFLOW_FILENAMES = [
    "copilot-setup-steps.yml",
    "copilot-setup-steps.yaml",
];

const MAX_WORKFLOW_FILE_BYTES = 1024 * 1024;

export class FileSystemWorkflowGateway implements WorkflowGateway {
    private config: CopilotSetupConfig | null = null;

    private async getConfig(): Promise<CopilotSetupConfig> {
        if (!this.config) {
            this.config = await loadCopilotSetupConfig();
        }
        return this.config;
    }

    private async findCopilotSetupWorkflowPath(
        targetDir: string,
    ): Promise<string | null> {
        for (const filename of COPILOT_SETUP_WORKFLOW_FILENAMES) {
            const workflowPath = await resolveSafePath(
                targetDir,
                `.github/workflows/${filename}`,
            );
            if (await fileExists(workflowPath)) {
                return workflowPath;
            }
        }
        return null;
    }

    async parseWorkflowsForSetupActions(
        targetDir: string,
    ): Promise<SetupStepCandidate[]> {
        const workflowsDir = await resolveSafePath(
            targetDir,
            ".github/workflows",
        );

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
            const filePath = await resolveSafePath(
                targetDir,
                `.github/workflows/${file}`,
            );

            await assertFileSizeWithinLimit(
                filePath,
                MAX_WORKFLOW_FILE_BYTES,
                `Workflow file '${file}'`,
            );
            const content = await readFile(filePath, "utf-8");

            try {
                const workflow = parseYaml(content);
                const candidates = extractSetupStepsFromWorkflow(
                    workflow,
                    config.setupActionPatterns,
                );
                allCandidates.push(...candidates);
            } catch {
                // Skip malformed YAML workflow files while continuing scan.
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
        if (existingPath) {
            return existingPath;
        }

        return resolveSafePath(
            targetDir,
            ".github/workflows/copilot-setup-steps.yml",
        );
    }

    async readCopilotSetupWorkflow(targetDir: string): Promise<unknown | null> {
        const workflowPath = await this.findCopilotSetupWorkflowPath(targetDir);

        if (!workflowPath) {
            return null;
        }

        await assertFileSizeWithinLimit(
            workflowPath,
            MAX_WORKFLOW_FILE_BYTES,
            "Copilot setup workflow",
        );
        const content = await readFile(workflowPath, "utf-8");
        return parseYaml(content);
    }

    async writeCopilotSetupWorkflow(
        targetDir: string,
        content: string,
    ): Promise<void> {
        const existingPath = await this.findCopilotSetupWorkflowPath(targetDir);
        const workflowPath =
            existingPath ??
            (await resolveSafePath(
                targetDir,
                ".github/workflows/copilot-setup-steps.yml",
            ));

        await writeFile(workflowPath, content, "utf-8");
    }
}

export function createWorkflowGateway(): WorkflowGateway {
    return new FileSystemWorkflowGateway();
}
