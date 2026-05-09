/**
 * Use Cases - Application-specific business rules
 */

export type {
    Lesson,
    LessonProvenance,
    LessonTriggers,
    LessonType,
} from "../entities/lesson.js";
export {
    allActionsResolved,
    buildActionsToResolve,
    buildActionToResolve,
    findResolvedVersion,
    formatShaPinnedAction,
    generateLookupUrl,
    getActionVersion,
    VERSION_PLACEHOLDER,
    VERSION_RESOLUTION_INSTRUCTIONS,
} from "./action-resolution.js";
export { buildCandidatesFromEnvironment } from "./candidate-builder.js";
export {
    buildCapturePrompt,
    type CapturePromptInput,
    type CapturePromptOutput,
    STOP_CAPTURE_TEMPLATE,
    SUBAGENT_STOP_CAPTURE_TEMPLATE,
} from "./capture-prompt-use-case.js";
export {
    type ClaudePreToolUseHookInput,
    ClaudePreToolUseHookInputSchema,
    type ClaudeSessionStartHookInput,
    ClaudeSessionStartHookInputSchema,
    type ClaudeStopHookInput,
    ClaudeStopHookInputSchema,
    type ClaudeSubagentStopHookInput,
    ClaudeSubagentStopHookInputSchema,
} from "./claude-hook-input-schema.js";
export {
    type AdditionalContextPayload,
    buildAdditionalContextResponse,
    buildPermissionDecisionResponse,
    type ClaudeHookEventName,
} from "./claude-hook-response.js";
export {
    buildSessionStartHooks,
    generateEnvironmentSetupSection,
    mergeClaudeDocumentation,
    mergeClaudeSettings,
} from "./claude-setup.js";
export {
    type CreateCopilotAgentResult,
    CreateCopilotAgentUseCase,
} from "./create-copilot-agent.js";
export {
    type CreateSkillResult,
    CreateSkillUseCase,
} from "./create-skill.js";
export type {
    InitHooksConfig,
    InitHooksConfigGatewayPort,
    InitHooksResult,
} from "./init-hooks-gateway-port.js";
export {
    type InitHooksInput,
    type InitHooksOutput,
    InitHooksUseCase,
} from "./init-hooks-use-case.js";
export {
    type LessonContextInput,
    type LessonContextOutput,
    LessonContextUseCase,
} from "./lesson-context-use-case.js";
export type {
    LessonFileGatewayPort,
    LessonReadError,
    ParsedLesson,
    ReadLessonsResult,
} from "./lesson-file-gateway-port.js";
export {
    type LessonFrontmatter,
    LessonFrontmatterSchema,
} from "./lesson-schema.js";
export {
    type LintLessonsError,
    type LintLessonsInput,
    type LintLessonsOutput,
    LintLessonsUseCase,
} from "./lint-lessons-use-case.js";
export {
    AgentSkillFrontmatterSchema,
    type LintSkillFrontmatterInput,
    type LintSkillFrontmatterOutput,
    LintSkillFrontmatterUseCase,
    type SkillLintGateway,
} from "./lint-skill-frontmatter.js";
export {
    type GenerateWorkflowOptions,
    generateWorkflowContent,
    updateWorkflowWithMissingSteps,
} from "./workflow-generator.js";
