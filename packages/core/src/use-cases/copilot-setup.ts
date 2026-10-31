/**
 * Use cases for the Copilot Setup Steps feature.
 * This module re-exports from candidate-builder and workflow-generator
 * for backwards compatibility.
 */

// Re-export candidate building functionality
export { buildCandidatesFromEnvironment } from "./candidate-builder.js";

// Re-export workflow generation functionality
export { findPlaceholderActionsToPin } from "./placeholder-pinning.js";
export {
    COPILOT_SETUP_JOB_NAME,
    type GenerateWorkflowOptions,
    generateWorkflowContent,
    updateWorkflowWithMissingSteps,
} from "./workflow-generator.js";
