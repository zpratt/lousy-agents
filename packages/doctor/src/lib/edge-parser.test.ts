import Chance from "chance";
import { describe, expect, it } from "vitest";
import { parseRawEdges } from "./edge-parser.js";

const chance = new Chance();

function frontmatterDocument(frontmatterLines: string[], body = ""): string {
    return ["---", ...frontmatterLines, "---", body].join("\n");
}

describe("parseRawEdges", () => {
    describe("when the content has no frontmatter and no references", () => {
        it("should return no edges", () => {
            const content = `${chance.sentence()}\n`;

            const edges = parseRawEdges(content);

            expect(edges).toEqual([]);
        });
    });

    describe("when frontmatter declares applyTo", () => {
        it("should return one glob-binding edge for a string value", () => {
            const glob = `${chance.word()}/**/*.ts`;
            const content = frontmatterDocument([`applyTo: "${glob}"`]);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([{ type: "glob-binding", rawTarget: glob }]);
        });

        it("should return one glob-binding edge per string in an array value", () => {
            const firstGlob = `${chance.word()}/**/*.ts`;
            const secondGlob = `${chance.word()}/**/*.md`;
            const content = frontmatterDocument([
                "applyTo:",
                `  - "${firstGlob}"`,
                `  - "${secondGlob}"`,
            ]);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([
                { type: "glob-binding", rawTarget: firstGlob },
                { type: "glob-binding", rawTarget: secondGlob },
            ]);
        });

        it("should ignore non-string entries in an array value", () => {
            const glob = `${chance.word()}/**/*.ts`;
            const content = frontmatterDocument([
                "applyTo:",
                `  - "${glob}"`,
                "  - 42",
                "  - true",
            ]);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([{ type: "glob-binding", rawTarget: glob }]);
        });

        it("should return no edge for an empty string value", () => {
            const content = frontmatterDocument(['applyTo: ""']);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([]);
        });

        it("should return no edge for a non-string, non-array value", () => {
            const content = frontmatterDocument(["applyTo: 42"]);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([]);
        });
    });

    describe("when frontmatter declares soft-reference keys", () => {
        it.each(["see", "references", "requires"])(
            "should return a soft-reference edge for an instruction path under '%s'",
            (key) => {
                const target = `./${chance.word()}.md`;
                const content = frontmatterDocument([`${key}: "${target}"`]);

                const edges = parseRawEdges(content);

                expect(edges).toEqual([
                    { type: "soft-reference", rawTarget: target },
                ]);
            },
        );

        it("should accept .mdc instruction paths and array values", () => {
            const mdcTarget = `./${chance.word()}.mdc`;
            const mdTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument([
                "see:",
                `  - "${mdcTarget}"`,
                `  - "${mdTarget}"`,
            ]);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: mdcTarget },
                { type: "soft-reference", rawTarget: mdTarget },
            ]);
        });

        it("should ignore values that are not instruction file paths", () => {
            const content = frontmatterDocument([
                `see: "./${chance.word()}.txt"`,
            ]);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([]);
        });

        it("should ignore keys that are not soft-reference keys", () => {
            const content = frontmatterDocument([
                `description: "./${chance.word()}.md"`,
            ]);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([]);
        });

        it("should return no edge for an empty value", () => {
            const content = frontmatterDocument(['see: ""']);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([]);
        });
    });

    describe("when the body contains an @path import", () => {
        it("should return a hard-import edge", () => {
            const target = `./${chance.word()}.md`;
            const content = `${chance.sentence()}\n@${target}\n`;

            const edges = parseRawEdges(content);

            expect(edges).toEqual([{ type: "hard-import", rawTarget: target }]);
        });

        it("should return a bare file name such as @AGENTS.md as a hard-import", () => {
            const edges = parseRawEdges("@AGENTS.md\n");

            expect(edges).toEqual([
                { type: "hard-import", rawTarget: "AGENTS.md" },
            ]);
        });

        it("should mark a token that does not look like a path as speculative, so a miss is not reported", () => {
            const edges = parseRawEdges("@types/node\n");

            expect(edges).toEqual([
                {
                    type: "hard-import",
                    rawTarget: "types/node",
                    speculative: true,
                },
            ]);
        });

        it("should not return a quoted path", () => {
            const edges = parseRawEdges('@"./q.md"\n');

            expect(edges).toEqual([]);
        });

        it("should ignore an @path import inside a fenced code block", () => {
            const target = `./${chance.word()}.md`;
            const content = ["```", `@${target}`, "```", ""].join("\n");

            const edges = parseRawEdges(content);

            expect(edges).toEqual([]);
        });
    });

    describe("when the body contains markdown links", () => {
        it("should return a soft-reference edge for a relative instruction link", () => {
            const target = `./${chance.word()}.md`;
            const content = `See [guide](${target}) for details.\n`;

            const edges = parseRawEdges(content);

            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: target },
            ]);
        });

        it.each(["http", "https"])(
            "should ignore a %s link even when it ends in .md",
            (scheme) => {
                const content = `[docs](${scheme}://example.com/${chance.word()}.md)\n`;

                const edges = parseRawEdges(content);

                expect(edges).toEqual([]);
            },
        );

        it("should ignore a link that is not an instruction file path", () => {
            const content = `[source](./${chance.word()}.ts)\n`;

            const edges = parseRawEdges(content);

            expect(edges).toEqual([]);
        });

        it("should return one edge per instruction link", () => {
            const firstTarget = `./${chance.word()}.md`;
            const secondTarget = `./${chance.word()}.mdc`;
            const content = `[a](${firstTarget}) and [b](${secondTarget})\n`;

            const edges = parseRawEdges(content);

            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: firstTarget },
                { type: "soft-reference", rawTarget: secondTarget },
            ]);
        });
    });

    describe("when the content mixes every edge source", () => {
        it("should return edges ordered glob-binding, frontmatter soft-reference, hard-import, then link soft-reference", () => {
            const glob = `${chance.word()}/**/*.ts`;
            const frontmatterTarget = `./${chance.word()}.md`;
            const importTarget = `./${chance.word()}.md`;
            const linkTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument(
                [`applyTo: "${glob}"`, `see: "${frontmatterTarget}"`],
                `@${importTarget}\n[link](${linkTarget})\n`,
            );

            const edges = parseRawEdges(content);

            expect(edges).toEqual([
                { type: "glob-binding", rawTarget: glob },
                { type: "soft-reference", rawTarget: frontmatterTarget },
                { type: "hard-import", rawTarget: importTarget },
                { type: "soft-reference", rawTarget: linkTarget },
            ]);
        });
    });

    describe("when the frontmatter block is not usable frontmatter", () => {
        it("should not scan a valid frontmatter block as body content", () => {
            const hiddenTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument([
                `description: "[hidden](${hiddenTarget})"`,
            ]);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([]);
        });

        it("should scan the whole content when the frontmatter is not valid YAML", () => {
            const linkTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument(
                ["applyTo: [unclosed", `note: [inside](${linkTarget})`],
                chance.sentence(),
            );

            const edges = parseRawEdges(content);

            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: linkTarget },
            ]);
        });

        it("should scan the whole content when the frontmatter is a scalar", () => {
            const linkTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument([`[inside](${linkTarget})`]);

            const edges = parseRawEdges(content);

            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: linkTarget },
            ]);
        });
    });
});
