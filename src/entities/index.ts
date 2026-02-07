/**
 * Entities - Core domain types and interfaces
 */
export { generateAgentContent, normalizeAgentName } from "./copilot-agent.js";
export type {
    ActionToResolve,
    DetectedEnvironment,
    ResolvedVersion,
    SetupStepCandidate,
    VersionFile,
    VersionFileType,
    WorkflowStep,
} from "./copilot-setup.js";
export { generateSkillContent, normalizeSkillName } from "./skill.js";
