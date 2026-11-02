export { DOCTOR_ARGS } from "./cli/doctor-args.js";
export type { DoctorProcess } from "./cli/process-environment.js";
export { processDoctorEnvironment } from "./cli/process-environment.js";
export type { DoctorCommandEnvironment } from "./cli/run-doctor-command.js";
export { runDoctorCommand } from "./cli/run-doctor-command.js";
export type {
    Archetype,
    ArchetypeClassification,
} from "./entities/archetype.js";
export type { Criterion } from "./entities/criteria-schema.js";
export type { DeclaredIntentArtifact } from "./entities/declared-intent.js";
export type { InventoryRecord } from "./entities/edge-types.js";
export type { Finding } from "./entities/finding.js";
export type {
    IntentLoadReport,
    IntentLoadStatus,
    IntentSchemaIssue,
} from "./entities/intent-load.js";
export {
    hasBlockingFindings,
    renderHuman,
} from "./formatters/human-renderer.js";
export type {
    ReportInventoryItem,
    ReportJson,
    SummaryReportJson,
} from "./formatters/json-formatter.js";
export { toInventoryItems, toJson } from "./formatters/json-formatter.js";
export { formatSummary } from "./formatters/summary-formatter.js";
export {
    buildDefaultIntent,
    readIntentArtifact,
    writeIntentArtifact,
} from "./gateways/intent-artifact.js";
export { scanRepository } from "./gateways/scanner.js";
export {
    createWisdomClient,
    WisdomUnavailableError,
} from "./gateways/wisdom-client.js";
export type { DoctorFormat } from "./lib/doctor-options.js";
export { classifyArchetype } from "./use-cases/classify-archetype.js";
export { CRITERIA } from "./use-cases/criteria.js";
export { detectAmbiguities } from "./use-cases/detect-ambiguities.js";
export { evaluate } from "./use-cases/evaluate-engine.js";
