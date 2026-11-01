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
            // Arrange
            const content = `${chance.sentence()}\n`;

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([]);
        });
    });

    describe("when frontmatter declares applyTo", () => {
        it("should return one glob-binding edge for a string value", () => {
            // Arrange
            const glob = `${chance.word()}/**/*.ts`;
            const content = frontmatterDocument([`applyTo: "${glob}"`]);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([{ type: "glob-binding", rawTarget: glob }]);
        });

        it("should return one glob-binding edge per string in an array value", () => {
            // Arrange
            const firstGlob = `${chance.word()}/**/*.ts`;
            const secondGlob = `${chance.word()}/**/*.md`;
            const content = frontmatterDocument([
                "applyTo:",
                `  - "${firstGlob}"`,
                `  - "${secondGlob}"`,
            ]);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([
                { type: "glob-binding", rawTarget: firstGlob },
                { type: "glob-binding", rawTarget: secondGlob },
            ]);
        });

        it("should ignore non-string entries in an array value", () => {
            // Arrange
            const glob = `${chance.word()}/**/*.ts`;
            const content = frontmatterDocument([
                "applyTo:",
                `  - "${glob}"`,
                "  - 42",
                "  - true",
            ]);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([{ type: "glob-binding", rawTarget: glob }]);
        });

        it("should return no edge for an empty string value", () => {
            // Arrange
            const content = frontmatterDocument(['applyTo: ""']);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([]);
        });

        it("should return no edge for a non-string, non-array value", () => {
            // Arrange
            const content = frontmatterDocument(["applyTo: 42"]);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([]);
        });
    });

    describe("when frontmatter declares soft-reference keys", () => {
        it.each(["see", "references", "requires"])(
            "should return a soft-reference edge for an instruction path under '%s'",
            (key) => {
                // Arrange
                const target = `./${chance.word()}.md`;
                const content = frontmatterDocument([`${key}: "${target}"`]);

                // Act
                const edges = parseRawEdges(content);

                // Assert
                expect(edges).toEqual([
                    { type: "soft-reference", rawTarget: target },
                ]);
            },
        );

        it("should accept .mdc instruction paths and array values", () => {
            // Arrange
            const mdcTarget = `./${chance.word()}.mdc`;
            const mdTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument([
                "see:",
                `  - "${mdcTarget}"`,
                `  - "${mdTarget}"`,
            ]);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: mdcTarget },
                { type: "soft-reference", rawTarget: mdTarget },
            ]);
        });

        it("should ignore values that are not instruction file paths", () => {
            // Arrange
            const content = frontmatterDocument([
                `see: "./${chance.word()}.txt"`,
            ]);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([]);
        });

        it("should ignore keys that are not soft-reference keys", () => {
            // Arrange
            const content = frontmatterDocument([
                `description: "./${chance.word()}.md"`,
            ]);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([]);
        });

        it("should return no edge for an empty value", () => {
            // Arrange
            const content = frontmatterDocument(['see: ""']);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([]);
        });
    });

    describe("when the body contains an @path import", () => {
        it("should return a hard-import edge", () => {
            // Arrange
            const target = `./${chance.word()}.md`;
            const content = `${chance.sentence()}\n@${target}\n`;

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([{ type: "hard-import", rawTarget: target }]);
        });

        it("should ignore an @path import inside a fenced code block", () => {
            // Arrange
            const target = `./${chance.word()}.md`;
            const content = ["```", `@${target}`, "```", ""].join("\n");

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([]);
        });
    });

    describe("when the body contains markdown links", () => {
        it("should return a soft-reference edge for a relative instruction link", () => {
            // Arrange
            const target = `./${chance.word()}.md`;
            const content = `See [guide](${target}) for details.\n`;

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: target },
            ]);
        });

        it.each(["http", "https"])(
            "should ignore a %s link even when it ends in .md",
            (scheme) => {
                // Arrange
                const content = `[docs](${scheme}://example.com/${chance.word()}.md)\n`;

                // Act
                const edges = parseRawEdges(content);

                // Assert
                expect(edges).toEqual([]);
            },
        );

        it("should ignore a link that is not an instruction file path", () => {
            // Arrange
            const content = `[source](./${chance.word()}.ts)\n`;

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([]);
        });

        it("should return one edge per instruction link", () => {
            // Arrange
            const firstTarget = `./${chance.word()}.md`;
            const secondTarget = `./${chance.word()}.mdc`;
            const content = `[a](${firstTarget}) and [b](${secondTarget})\n`;

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: firstTarget },
                { type: "soft-reference", rawTarget: secondTarget },
            ]);
        });
    });

    describe("when the content mixes every edge source", () => {
        it("should return edges ordered glob-binding, frontmatter soft-reference, hard-import, then link soft-reference", () => {
            // Arrange
            const glob = `${chance.word()}/**/*.ts`;
            const frontmatterTarget = `./${chance.word()}.md`;
            const importTarget = `./${chance.word()}.md`;
            const linkTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument(
                [`applyTo: "${glob}"`, `see: "${frontmatterTarget}"`],
                `@${importTarget}\n[link](${linkTarget})\n`,
            );

            // Act
            const edges = parseRawEdges(content);

            // Assert
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
            // Arrange
            const hiddenTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument([
                `description: "[hidden](${hiddenTarget})"`,
            ]);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([]);
        });

        it("should scan the whole content when the frontmatter is not valid YAML", () => {
            // Arrange
            const linkTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument(
                ["applyTo: [unclosed", `note: [inside](${linkTarget})`],
                chance.sentence(),
            );

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: linkTarget },
            ]);
        });

        it("should scan the whole content when the frontmatter is a scalar", () => {
            // Arrange
            const linkTarget = `./${chance.word()}.md`;
            const content = frontmatterDocument([`[inside](${linkTarget})`]);

            // Act
            const edges = parseRawEdges(content);

            // Assert
            expect(edges).toEqual([
                { type: "soft-reference", rawTarget: linkTarget },
            ]);
        });
    });
});
