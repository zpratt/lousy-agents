/**
 * File system implementation of the workflow gateway.
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SetupStepCandidate } from "../entities/copilot-setup.js";
import {
    type CopilotSetupConfig,
    loadCopilotSetupConfig,
} from "../lib/copilot-setup-config.js";
import type { WorkflowGateway } from "../use-cases/init-copilot-setup-workflow.js";
import {
    deduplicateCandidates,
    extractSetupStepsFromWorkflow,
} from "../use-cases/setup-step-discovery.js";
import {
    listDirectoryWithinRoot,
    pathExistsWithinRoot,
    readTextWithinRoot,
    resolveSafePath,
} from "./file-system-utils.js";

const COPILOT_SETUP_WORKFLOW_FILENAMES = [
    "copilot-setup-steps.yml",
    "copilot-setup-steps.yaml",
];

const MAX_WORKFLOW_FILE_BYTES = 1024 * 1024;

export class FileSystemWorkflowGateway implements WorkflowGateway {
    private config: CopilotSetupConfig | null = null;

    constructor(private readonly cwd?: string) {}

    private async getConfig(): Promise<CopilotSetupConfig> {
        if (!this.config) {
            this.config = await loadCopilotSetupConfig(
                this.cwd !== undefined ? resolve(this.cwd) : undefined,
            );
        }
        return this.config;
    }

    private async findCopilotSetupWorkflowPath(
        targetDir: string,
    ): Promise<string | null> {
        for (const filename of COPILOT_SETUP_WORKFLOW_FILENAMES) {
            const relativePath = `.github/workflows/${filename}`;
            if (await pathExistsWithinRoot(targetDir, relativePath)) {
                return resolveSafePath(targetDir, relativePath);
            }
        }
        return null;
    }

    async parseWorkflowsForSetupActions(
        targetDir: string,
    ): Promise<SetupStepCandidate[]> {
        const workflowsRelativeDir = ".github/workflows";
        if (!(await pathExistsWithinRoot(targetDir, workflowsRelativeDir))) {
            return [];
        }

        const files = await listDirectoryWithinRoot(
            targetDir,
            workflowsRelativeDir,
        );
        const yamlFiles = files.filter(
            (f) =>
                f.isFile() &&
                (f.name.endsWith(".yml") || f.name.endsWith(".yaml")),
        );

        const config = await this.getConfig();
        const allCandidates: SetupStepCandidate[] = [];

        for (const file of yamlFiles) {
            const relativePath = `.github/workflows/${file.name}`;
            const content = await readTextWithinRoot(
                targetDir,
                relativePath,
                MAX_WORKFLOW_FILE_BYTES,
            );

            try {
                const workflow = parseYaml(content);
                const candidates = extractSetupStepsFromWorkflow(
                    workflow,
                    config.setupActionPatterns,
                );
                allCandidates.push(...candidates);
            } catch {}
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

        const workflowRelativePath = workflowPath.endsWith(
            "copilot-setup-steps.yaml",
        )
            ? ".github/workflows/copilot-setup-steps.yaml"
            : ".github/workflows/copilot-setup-steps.yml";
        const content = await readTextWithinRoot(
            targetDir,
            workflowRelativePath,
            MAX_WORKFLOW_FILE_BYTES,
        );
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

export function createWorkflowGateway(cwd?: string): WorkflowGateway {
    return new FileSystemWorkflowGateway(cwd);
}
