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
export type {
    DiscoveredFeedbackLoops,
    DiscoveredScript,
    DiscoveredTool,
    FeedbackLoopCoverage,
    FeedbackLoopPhase,
    InstructionReference,
} from "./feedback-loop.js";
export {
    determineScriptPhase,
    isScriptMandatory,
    MANDATORY_SCRIPT_NAMES,
    SCRIPT_PHASE_MAPPING,
} from "./feedback-loop.js";
export { generateSkillContent, normalizeSkillName } from "./skill.js";
