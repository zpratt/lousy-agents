/**
 * Gateway interface for GitHub Actions workflow operations.
 */

export type { WorkflowGateway } from "../use-cases/init-copilot-setup-workflow.js";

export {
    createWorkflowGateway,
    FileSystemWorkflowGateway,
} from "./file-system-workflow-gateway.js";
