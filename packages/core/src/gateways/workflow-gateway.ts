/**
 * Gateway interface for GitHub Actions workflow operations.
 */

// Re-export port type from the use case that owns it
export type { WorkflowGateway } from "../use-cases/init-copilot-setup-workflow.js";

// Re-export implementation and factory from the implementation file
export {
    createWorkflowGateway,
    FileSystemWorkflowGateway,
} from "./file-system-workflow-gateway.js";
