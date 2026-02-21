/**
 * Gateways - External interfaces and adapters (CLEAN architecture)
 */
export {
    type ActionVersionGateway,
    createActionVersionGateway,
    KNOWN_ACTIONS,
    LocalActionVersionGateway,
} from "./action-version-gateway.js";
export {
    type AgentFileGateway,
    createAgentFileGateway,
    FileSystemAgentFileGateway,
} from "./agent-file-gateway.js";
export {
    createEnvironmentGateway,
    type EnvironmentGateway,
    FileSystemEnvironmentGateway,
} from "./environment-gateway.js";
export { fileExists } from "./file-system-utils.js";
export {
    createInstructionAnalysisGateway,
    FileSystemInstructionAnalysisGateway,
    type InstructionAnalysisGateway,
} from "./instruction-analysis-gateway.js";
export {
    createScriptDiscoveryGateway,
    FileSystemScriptDiscoveryGateway,
    type ScriptDiscoveryGateway,
} from "./script-discovery-gateway.js";
export {
    createSkillFileGateway,
    FileSystemSkillFileGateway,
    type SkillFileGateway,
} from "./skill-file-gateway.js";
export {
    createSkillLintGateway,
    FileSystemSkillLintGateway,
} from "./skill-lint-gateway.js";
export {
    createToolDiscoveryGateway,
    FileSystemToolDiscoveryGateway,
    type ToolDiscoveryGateway,
} from "./tool-discovery-gateway.js";
export {
    createWorkflowGateway,
    FileSystemWorkflowGateway,
    type WorkflowGateway,
} from "./workflow-gateway.js";
