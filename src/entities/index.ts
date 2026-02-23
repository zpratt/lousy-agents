/**
 * Entities - Core domain types and interfaces
 */
export type {
    ClaudeEnvironmentRecommendation,
    ClaudeSettings,
    ClaudeSetupAction,
    ClaudeSetupResult,
    SessionStartHook,
} from "./claude-setup.js";
export { generateAgentContent, normalizeAgentName } from "./copilot-agent.js";
export type {
    ActionToResolve,
    CopilotReviewStatus,
    DetectedEnvironment,
    ResolvedVersion,
    Ruleset,
    RulesetRule,
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
export type {
    DiscoveredSkillFile,
    ParsedFrontmatter,
    SkillLintDiagnostic,
    SkillLintResult,
    SkillLintSeverity,
} from "./skill.js";
export { generateSkillContent, normalizeSkillName } from "./skill.js";
