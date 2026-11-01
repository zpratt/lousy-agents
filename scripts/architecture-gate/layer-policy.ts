import { z } from "zod";
import {
    firstIssueError,
    mustBeArray,
    mustBeNonEmptyText,
    mustBeObject,
} from "./zod-issues.js";

export interface Layer {
    readonly name: string;
    readonly prefixes: readonly string[];
}

export interface ForbiddenImport {
    readonly from: string;
    readonly to: string;
}

/** The layering rules that coach enforces, as committed in project.json. */
export interface LayerPolicy {
    readonly layers: readonly Layer[];
    readonly forbiddenImports: readonly ForbiddenImport[];
}

const SUPPORTED_SCHEMA_VERSION = "1";
const REPOSITORY_ROOT = ".";

function isNormalizedRepositoryPath(value: unknown): value is string {
    return (
        typeof value === "string" &&
        (value === REPOSITORY_ROOT ||
            (value !== "" &&
                !value.includes("\\") &&
                value
                    .split("/")
                    .every(
                        (segment) =>
                            segment !== "" &&
                            segment !== "." &&
                            segment !== "..",
                    )))
    );
}

const nonEmptyText = z
    .string({ error: mustBeNonEmptyText })
    .min(1, { error: mustBeNonEmptyText });

const layerSchema = z
    .object(
        {
            name: nonEmptyText,
            prefixes: z.array(z.unknown(), mustBeArray("prefixes")),
        },
        mustBeObject("layer"),
    )
    .superRefine((layer, context) => {
        if (layer.prefixes.length === 0) {
            context.addIssue({
                code: "custom",
                message: `layer "${layer.name}" must have at least one prefix`,
            });
        }
        for (const prefix of layer.prefixes) {
            if (!isNormalizedRepositoryPath(prefix)) {
                context.addIssue({
                    code: "custom",
                    message: `layer "${layer.name}" prefix ${JSON.stringify(prefix)} must be a normalized repository-relative path`,
                });
            }
        }
    })
    .transform(
        (layer): Layer => ({
            name: layer.name,
            prefixes: layer.prefixes.filter(isNormalizedRepositoryPath),
        }),
    );

const forbiddenImportSchema = z.object(
    { from: nonEmptyText, to: nonEmptyText },
    mustBeObject("forbidden import"),
);

const layersSchema = z
    .array(layerSchema, {
        error: "project policy layers must be an array",
    })
    .min(1, { error: "project policy must declare at least one layer" })
    .superRefine((layers, context) => {
        const names = layers.map((layer) => layer.name);
        const repeated = names.find(
            (name, index) => names.indexOf(name) !== index,
        );
        if (repeated !== undefined) {
            context.addIssue({
                code: "custom",
                message: `layer name "${repeated}" is declared twice`,
            });
        }
    });

const policySchema = z
    .object(
        {
            // biome-ignore lint/style/useNamingConvention: coach's file format
            schema_version: z.literal(SUPPORTED_SCHEMA_VERSION, {
                error: `project policy schema_version must be "${SUPPORTED_SCHEMA_VERSION}"`,
            }),
            layers: layersSchema,
            // biome-ignore lint/style/useNamingConvention: coach's file format
            forbidden_imports: z
                .array(forbiddenImportSchema, {
                    error: "project policy forbidden_imports must be an array",
                })
                .min(1, {
                    error: "project policy must declare at least one forbidden import",
                }),
        },
        { error: "project policy must be a JSON object" },
    )
    .superRefine((policy, context) => {
        const declared = new Set(policy.layers.map((layer) => layer.name));
        policy.forbidden_imports.forEach((pair, index) => {
            const undeclared = [pair.from, pair.to].find(
                (name) => !declared.has(name),
            );
            if (undeclared !== undefined) {
                context.addIssue({
                    code: "custom",
                    message: `forbidden_imports[${index}] (${pair.from} -> ${pair.to}) names the undeclared layer "${undeclared}"`,
                });
            }
        });
    })
    .transform(
        (policy): LayerPolicy => ({
            layers: policy.layers,
            forbiddenImports: policy.forbidden_imports,
        }),
    );

/**
 * Reads the policy coach enforces from the parsed contents of project.json,
 * rejecting any document that would leave the gate checking nothing.
 */
export function parseLayerPolicy(document: unknown): LayerPolicy {
    const result = policySchema.safeParse(document);
    if (!result.success) {
        throw firstIssueError(result.error);
    }
    return result.data;
}
