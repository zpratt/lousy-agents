import type { ArchetypeClassification } from "../entities/archetype.js";
import type {
    Criterion,
    EdgePresentArgs,
    FileExistsArgs,
} from "../entities/criteria-schema.js";
import type { DeclaredIntentArtifact } from "../entities/declared-intent.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import type { Finding } from "../entities/finding.js";
import {
    type IntentLoadStatus,
    isIntentRejected,
} from "../entities/intent-load.js";

interface EvaluationContext {
    records: InventoryRecord[];
    classification: ArchetypeClassification;
    intent: DeclaredIntentArtifact | null;
    /** How the intent file load went; omitted means absent when intent is null. */
    intentLoadStatus?: IntentLoadStatus;
}

/**
 * The artifact is authoritative: a parsed intent means loaded, and a null
 * intent can never be loaded. The status only refines why intent is null.
 */
function resolveIntentLoadStatus(ctx: EvaluationContext): IntentLoadStatus {
    if (ctx.intent !== null) return "loaded";
    const status = ctx.intentLoadStatus;
    return status === undefined || status === "loaded" ? "absent" : status;
}

function makeIntentFinding(criterion: Criterion): Finding {
    return {
        id: makeId(criterion.id, "all:intent"),
        criterionId: criterion.id,
        targetId: "all:intent",
        severity: criterion.severity,
        category: criterion.category,
        classification: criterion.classification,
        intentGated: false,
        assumedIntent: true,
        description: criterion.description,
    };
}

function makeId(criterionId: string, targetId: string): string {
    return `${criterionId}:${targetId}`;
}

function checkFileExists(
    criterion: Criterion,
    args: FileExistsArgs,
    ctx: EvaluationContext,
): Finding[] {
    const { harness, paths } = args;

    const anyMatch = ctx.records.some((r) =>
        paths.some(
            (p) =>
                r.path === p ||
                r.path.startsWith(p.endsWith("/") ? p : `${p}/`),
        ),
    );

    if (!anyMatch) {
        return [
            {
                id: makeId(criterion.id, `${harness}:all`),
                criterionId: criterion.id,
                targetId: `${harness}:all`,
                severity: criterion.severity,
                category: criterion.category,
                classification: criterion.classification,
                intentGated: false,
                assumedIntent: false,
                description: criterion.description,
            },
        ];
    }

    return [];
}

function checkIntentArtifactAbsent(
    criterion: Criterion,
    ctx: EvaluationContext,
): Finding[] {
    const hasRecords = ctx.records.length > 0;
    const isAbsent = resolveIntentLoadStatus(ctx) === "absent";

    return hasRecords && isAbsent ? [makeIntentFinding(criterion)] : [];
}

function checkIntentArtifactRejected(
    criterion: Criterion,
    ctx: EvaluationContext,
): Finding[] {
    const hasRecords = ctx.records.length > 0;
    const isRejected = isIntentRejected(resolveIntentLoadStatus(ctx));

    return hasRecords && isRejected ? [makeIntentFinding(criterion)] : [];
}

function checkEdgePresent(
    criterion: Criterion,
    args: EdgePresentArgs,
    ctx: EvaluationContext,
): Finding[] {
    const fromRecords = ctx.records.filter(
        (r) => r.harness === args.fromHarness,
    );

    const hasMalformedEdges = fromRecords.some((r) =>
        r.edges.some(
            (e) =>
                e.malformed &&
                (args.edgeType === undefined || e.type === args.edgeType),
        ),
    );

    if (hasMalformedEdges) {
        return [
            {
                id: makeId(criterion.id, `${args.fromHarness}:malformed`),
                criterionId: criterion.id,
                targetId: `${args.fromHarness}:malformed`,
                severity: criterion.severity,
                category: criterion.category,
                classification: criterion.classification,
                intentGated: false,
                assumedIntent: false,
                description: criterion.description,
            },
        ];
    }

    return [];
}

function checkEdgeDirection(
    criterion: Criterion,
    args: EdgePresentArgs,
    ctx: EvaluationContext,
): Finding[] {
    const fromRecords = ctx.records.filter(
        (r) => r.harness === args.fromHarness,
    );
    const toRecords = ctx.records.filter((r) => r.harness === args.toHarness);
    const toPaths = new Set(toRecords.map((r) => r.path));

    const hasDirectedEdge = fromRecords.some((r) =>
        r.edges.some(
            (e) =>
                !e.malformed &&
                (args.edgeType === undefined || e.type === args.edgeType) &&
                typeof e.direction.to === "string" &&
                toPaths.has(e.direction.to),
        ),
    );

    if (!hasDirectedEdge) {
        return [
            {
                id: makeId(
                    criterion.id,
                    `${args.fromHarness}:${args.toHarness}`,
                ),
                criterionId: criterion.id,
                targetId: `${args.fromHarness}:${args.toHarness}`,
                severity: criterion.severity,
                category: criterion.category,
                classification: criterion.classification,
                intentGated: false,
                assumedIntent: false,
                description: criterion.description,
            },
        ];
    }

    return [];
}

function checkArchetypeIs(
    criterion: Criterion,
    ctx: EvaluationContext,
): Finding[] {
    return [
        {
            id: makeId(criterion.id, `all:${ctx.classification.archetype}`),
            criterionId: criterion.id,
            targetId: `all:${ctx.classification.archetype}`,
            severity: criterion.severity,
            category: criterion.category,
            classification: criterion.classification,
            intentGated: false,
            assumedIntent: false,
            description: criterion.description,
        },
    ];
}

function checkEdgeDirectionExists(
    criterion: Criterion,
    args: EdgePresentArgs,
    ctx: EvaluationContext,
): Finding[] {
    const fromRecords = ctx.records.filter(
        (r) => r.harness === args.fromHarness,
    );
    const toRecords = ctx.records.filter((r) => r.harness === args.toHarness);
    const toPaths = new Set(toRecords.map((r) => r.path));

    const hasEdge = fromRecords.some((r) =>
        r.edges.some(
            (e) =>
                !e.malformed &&
                (args.edgeType === undefined || e.type === args.edgeType) &&
                typeof e.direction.to === "string" &&
                toPaths.has(e.direction.to),
        ),
    );

    if (hasEdge) {
        return [
            {
                id: makeId(
                    criterion.id,
                    `${args.fromHarness}:${args.toHarness}`,
                ),
                criterionId: criterion.id,
                targetId: `${args.fromHarness}:${args.toHarness}`,
                severity: criterion.severity,
                category: criterion.category,
                classification: criterion.classification,
                intentGated: false,
                assumedIntent: false,
                description: criterion.description,
            },
        ];
    }

    return [];
}

function checkCapabilityDeclared(
    criterion: Criterion,
    ctx: EvaluationContext,
): Finding[] {
    if (!criterion.capability || ctx.intent === null) return [];

    const isDeclared = ctx.intent.desiredCapabilities.includes(
        criterion.capability,
    );
    if (!isDeclared) {
        return [
            {
                id: makeId(criterion.id, `all:${criterion.capability}`),
                criterionId: criterion.id,
                targetId: `all:${criterion.capability}`,
                severity: criterion.severity,
                category: criterion.category,
                classification: criterion.classification,
                intentGated: true,
                assumedIntent: false,
                description: criterion.description,
            },
        ];
    }

    return [];
}

export function evaluate(
    criteria: readonly Criterion[],
    ctx: EvaluationContext,
): Finding[] {
    const findings: Finding[] = [];

    for (const criterion of criteria) {
        if (
            criterion.appliesToArchetype &&
            criterion.appliesToArchetype !== "all" &&
            ctx.classification.archetype !== criterion.appliesToArchetype
        ) {
            continue;
        }

        const harnesses = new Set(ctx.records.map((r) => r.harness));
        if (
            criterion.appliesToHarness !== "all" &&
            !harnesses.has(criterion.appliesToHarness)
        ) {
            continue;
        }

        switch (criterion.checkMethod) {
            case "inventory.fileExists": {
                findings.push(
                    ...checkFileExists(
                        criterion,
                        criterion.checkArgs as FileExistsArgs,
                        ctx,
                    ),
                );
                break;
            }
            case "intent.artifactAbsent": {
                findings.push(...checkIntentArtifactAbsent(criterion, ctx));
                break;
            }
            case "inventory.edgePresent": {
                findings.push(
                    ...checkEdgePresent(
                        criterion,
                        criterion.checkArgs as EdgePresentArgs,
                        ctx,
                    ),
                );
                break;
            }
            case "inventory.edgeDirection": {
                findings.push(
                    ...checkEdgeDirection(
                        criterion,
                        criterion.checkArgs as EdgePresentArgs,
                        ctx,
                    ),
                );
                break;
            }
            case "inventory.archetypeIs": {
                findings.push(...checkArchetypeIs(criterion, ctx));
                break;
            }
            case "inventory.edgeDirectionExists": {
                findings.push(
                    ...checkEdgeDirectionExists(
                        criterion,
                        criterion.checkArgs as EdgePresentArgs,
                        ctx,
                    ),
                );
                break;
            }
            case "intent.capabilityDeclared": {
                findings.push(...checkCapabilityDeclared(criterion, ctx));
                break;
            }
            case "intent.artifactRejected": {
                findings.push(...checkIntentArtifactRejected(criterion, ctx));
                break;
            }
            default:
                break;
        }
    }

    return findings;
}
