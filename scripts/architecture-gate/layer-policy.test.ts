import Chance from "chance";
import { describe, expect, it } from "vitest";
import { GateError } from "./gate-error.js";
import { parseLayerPolicy } from "./layer-policy.js";

const chance = new Chance();

const REPOSITORY_ROOT_PREFIX = ".";
const UNDECLARED_LAYER = "ghost";

function validDocument() {
    return {
        // biome-ignore lint/style/useNamingConvention: coach's file format
        schema_version: "1",
        layers: [
            { name: "inner", prefixes: ["packages/core/src/entities"] },
            { name: "outer", prefixes: ["packages/core/src/gateways"] },
        ],
        // biome-ignore lint/style/useNamingConvention: coach's file format
        forbidden_imports: [{ from: "inner", to: "outer" }],
    };
}

describe("parseLayerPolicy", () => {
    describe("when the document is a valid coach policy", () => {
        it("should return its layers and forbidden imports", () => {
            // Arrange
            const document = validDocument();

            // Act
            const policy = parseLayerPolicy(document);

            // Assert
            expect(policy).toEqual({
                layers: document.layers,
                forbiddenImports: document.forbidden_imports,
            });
        });

        it("should accept the repository root as the only prefix", () => {
            // Arrange
            const document = {
                ...validDocument(),
                layers: [
                    { name: "everything", prefixes: [REPOSITORY_ROOT_PREFIX] },
                ],
                // biome-ignore lint/style/useNamingConvention: coach's file format
                forbidden_imports: [{ from: "everything", to: "everything" }],
            };

            // Act
            const policy = parseLayerPolicy(document);

            // Assert
            expect(policy.layers[0]?.prefixes).toEqual([
                REPOSITORY_ROOT_PREFIX,
            ]);
        });
    });

    describe("when the document is not a policy object", () => {
        it.each([
            ["null", null],
            ["an array", []],
            ["a string", chance.word()],
        ])("should reject %s", (_label, document) => {
            // Act
            const parse = () => parseLayerPolicy(document);

            // Assert
            expect(parse).toThrow(GateError);
            expect(parse).toThrow(/project policy must be a JSON object/);
        });
    });

    describe("when the document would leave the gate enforcing nothing", () => {
        const unusableDocuments: ReadonlyArray<
            readonly [string, unknown, RegExp]
        > = [
            [
                "an unsupported schema version",
                // biome-ignore lint/style/useNamingConvention: coach's file format
                { ...validDocument(), schema_version: "2" },
                /schema_version must be "1"/,
            ],
            [
                "no layers",
                { ...validDocument(), layers: [] },
                /must declare at least one layer/,
            ],
            [
                "no forbidden imports",
                // biome-ignore lint/style/useNamingConvention: coach's file format
                { ...validDocument(), forbidden_imports: [] },
                /must declare at least one forbidden import/,
            ],
        ];

        it.each(unusableDocuments)(
            "should reject %s",
            (_label, document, message) => {
                // Act
                const parse = () => parseLayerPolicy(document);

                // Assert
                expect(parse).toThrow(message);
            },
        );
    });

    describe("when a layer is malformed", () => {
        const layerCases: ReadonlyArray<readonly [string, unknown, RegExp]> = [
            [
                "has no name",
                { prefixes: ["packages/a"] },
                /layers\[0\]\.name must be a non-empty string/,
            ],
            [
                "has no prefixes",
                { name: "empty", prefixes: [] },
                /layer "empty" must have at least one prefix/,
            ],
        ];

        it.each(layerCases)(
            "should reject a layer that %s",
            (_label, layer, message) => {
                // Arrange
                const document = { ...validDocument(), layers: [layer] };

                // Act
                const parse = () => parseLayerPolicy(document);

                // Assert
                expect(parse).toThrow(message);
            },
        );

        it("should reject two layers with the same name", () => {
            // Arrange
            const name = chance.word();
            const document = {
                ...validDocument(),
                layers: [
                    { name, prefixes: ["packages/a"] },
                    { name, prefixes: ["packages/b"] },
                ],
                // biome-ignore lint/style/useNamingConvention: coach's file format
                forbidden_imports: [{ from: name, to: name }],
            };

            // Act
            const parse = () => parseLayerPolicy(document);

            // Assert
            expect(parse).toThrow(`layer name "${name}" is declared twice`);
        });
    });

    describe("when a part of the document has the wrong shape", () => {
        const wrongShapes: ReadonlyArray<readonly [string, unknown, RegExp]> = [
            [
                "layers that are not a list",
                { ...validDocument(), layers: "inner" },
                /layers must be an array/,
            ],
            [
                "a layer that is not an object",
                { ...validDocument(), layers: ["inner"] },
                /layers\[0\] must be a JSON object/,
            ],
            [
                "a layer name that is not a string",
                {
                    ...validDocument(),
                    layers: [{ name: 7, prefixes: ["packages/a"] }],
                },
                /layers\[0\]\.name must be a non-empty string/,
            ],
            [
                "layer prefixes that are not a list",
                {
                    ...validDocument(),
                    layers: [{ name: "inner", prefixes: "packages/a" }],
                },
                /prefixes must be an array/,
            ],
            [
                "a prefix that is not a string",
                {
                    ...validDocument(),
                    layers: [{ name: "inner", prefixes: [7] }],
                    // biome-ignore lint/style/useNamingConvention: coach's file format
                    forbidden_imports: [{ from: "inner", to: "inner" }],
                },
                /prefix 7 must be a normalized repository-relative path/,
            ],
            [
                "forbidden imports that are not a list",
                // biome-ignore lint/style/useNamingConvention: coach's file format
                { ...validDocument(), forbidden_imports: {} },
                /forbidden_imports must be an array/,
            ],
            [
                "a forbidden import that is not an object",
                // biome-ignore lint/style/useNamingConvention: coach's file format
                { ...validDocument(), forbidden_imports: ["inner"] },
                /forbidden_imports\[0\] must be a JSON object/,
            ],
            [
                "a forbidden import with no source",
                // biome-ignore lint/style/useNamingConvention: coach's file format
                { ...validDocument(), forbidden_imports: [{ to: "outer" }] },
                /forbidden_imports\[0\]\.from must be a non-empty string/,
            ],
            [
                "a forbidden import with an empty destination",
                {
                    ...validDocument(),
                    // biome-ignore lint/style/useNamingConvention: coach's file format
                    forbidden_imports: [{ from: "inner", to: "" }],
                },
                /forbidden_imports\[0\]\.to must be a non-empty string/,
            ],
        ];

        it.each(wrongShapes)(
            "should reject %s",
            (_label, document, message) => {
                // Act
                const parse = () => parseLayerPolicy(document);

                // Assert
                expect(parse).toThrow(GateError);
                expect(parse).toThrow(message);
            },
        );
    });

    describe("when the document carries keys the gate does not use", () => {
        it("should ignore them", () => {
            // Arrange
            const document = { ...validDocument(), roots: ["."] };

            // Act
            const policy = parseLayerPolicy(document);

            // Assert
            expect(policy.layers).toHaveLength(2);
        });
    });

    describe("when a prefix is not a normalized repository-relative path", () => {
        it.each([
            "",
            "./packages/core",
            "packages/core/",
            "/packages/core",
            "packages//core",
            "packages/../core",
            "../core",
            "packages\\core",
        ])("should reject the prefix %j", (prefix) => {
            // Arrange
            const document = {
                ...validDocument(),
                layers: [{ name: "inner", prefixes: [prefix] }],
                // biome-ignore lint/style/useNamingConvention: coach's file format
                forbidden_imports: [{ from: "inner", to: "inner" }],
            };

            // Act
            const parse = () => parseLayerPolicy(document);

            // Assert
            expect(parse).toThrow(
                /prefix .* must be a normalized repository-relative path/,
            );
        });
    });

    describe("when a forbidden import names a layer that is not declared", () => {
        it.each([
            ["source", { from: UNDECLARED_LAYER, to: "inner" }],
            ["destination", { from: "inner", to: UNDECLARED_LAYER }],
        ])("should reject an undeclared %s layer", (_label, pair) => {
            // Arrange
            const document = {
                ...validDocument(),
                // biome-ignore lint/style/useNamingConvention: coach's file format
                forbidden_imports: [pair],
            };

            // Act
            const parse = () => parseLayerPolicy(document);

            // Assert
            expect(parse).toThrow(
                `names the undeclared layer "${UNDECLARED_LAYER}"`,
            );
        });
    });
});
