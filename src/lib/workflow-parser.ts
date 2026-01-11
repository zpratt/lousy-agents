/**
 * Workflow parser module.
 *
 * @deprecated This module is deprecated. Use the CLEAN architecture modules instead:
 * - Entities: src/entities/copilot-setup.ts
 * - Gateways: src/gateways/workflow-gateway.ts
 */

// Re-export types from entities for backward compatibility
export type { SetupStepCandidate } from "../entities/copilot-setup.js";

// Re-export from gateway for backward compatibility
export { createWorkflowGateway } from "../gateways/workflow-gateway.js";

import { createWorkflowGateway } from "../gateways/workflow-gateway.js";

/**
 * @deprecated Use createWorkflowGateway().parseWorkflowsForSetupActions() instead
 */
export async function parseWorkflowsForSetupActions(targetDir: string) {
    const gateway = createWorkflowGateway();
    return gateway.parseWorkflowsForSetupActions(targetDir);
}

/**
 * @deprecated Use createWorkflowGateway().copilotSetupWorkflowExists() instead
 */
export async function copilotSetupWorkflowExists(targetDir: string) {
    const gateway = createWorkflowGateway();
    return gateway.copilotSetupWorkflowExists(targetDir);
}

/**
 * @deprecated Use createWorkflowGateway().readCopilotSetupWorkflow() instead
 */
export async function readCopilotSetupWorkflow(targetDir: string) {
    const gateway = createWorkflowGateway();
    return gateway.readCopilotSetupWorkflow(targetDir);
}
