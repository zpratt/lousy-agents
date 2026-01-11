/**
 * Workflow generator module.
 *
 * @deprecated This module is deprecated. Use the CLEAN architecture modules instead:
 * - Entities: src/entities/copilot-setup.ts
 * - Use Cases: src/use-cases/copilot-setup.ts
 * - Gateways: src/gateways/workflow-gateway.ts
 */

// Re-export types from entities for backward compatibility
export type { WorkflowStep } from "../entities/copilot-setup.js";
// Re-export gateway for backward compatibility
export { createWorkflowGateway } from "../gateways/workflow-gateway.js";
// Re-export use cases for backward compatibility
export {
    buildCandidatesFromEnvironment,
    findMissingCandidates,
    generateWorkflowContent,
    getExistingActionsFromWorkflow,
    mergeCandidates,
    updateWorkflowWithMissingSteps,
} from "../use-cases/copilot-setup.js";

import { createWorkflowGateway } from "../gateways/workflow-gateway.js";

/**
 * @deprecated Use createWorkflowGateway().writeCopilotSetupWorkflow() instead
 */
export async function writeCopilotSetupWorkflow(
    targetDir: string,
    content: string,
): Promise<void> {
    const gateway = createWorkflowGateway();
    return gateway.writeCopilotSetupWorkflow(targetDir, content);
}
