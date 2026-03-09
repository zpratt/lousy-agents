/**
 * Gateway interface for GitHub Actions workflow operations.
 */

import type { SetupStepCandidate } from "../entities/copilot-setup.js";

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
     * Checks if the copilot-setup-steps workflow exists (supports .yml and .yaml)
     * @param targetDir The repository root directory
     * @returns True if the workflow exists
     */
    copilotSetupWorkflowExists(targetDir: string): Promise<boolean>;

    /**
     * Gets the path to the Copilot Setup Steps workflow file.
     * Returns the actual path if it exists, or the default path if it doesn't.
     * @param targetDir The repository root directory
     * @returns The workflow file path
     */
    getCopilotSetupWorkflowPath(targetDir: string): Promise<string>;

    /**
     * Reads and parses the existing copilot-setup-steps workflow (supports .yml and .yaml)
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

// Re-export implementation and factory from the implementation file
export {
    createWorkflowGateway,
    FileSystemWorkflowGateway,
} from "./file-system-workflow-gateway.js";
