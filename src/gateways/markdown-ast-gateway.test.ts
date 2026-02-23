import { describe, expect, it } from "vitest";
import { RemarkMarkdownAstGateway } from "./markdown-ast-gateway.js";

describe("RemarkMarkdownAstGateway", () => {
    const gateway = new RemarkMarkdownAstGateway();

    describe("parseContent", () => {
        describe("when content has headings", () => {
            it("should extract heading text and depth", () => {
                // Arrange
                const content = "# Title\n\n## Section\n\n### Subsection\n";

                // Act
                const result = gateway.parseContent(content);

                // Assert
                expect(result.headings).toHaveLength(3);
                expect(result.headings[0].text).toBe("Title");
                expect(result.headings[0].depth).toBe(1);
                expect(result.headings[1].text).toBe("Section");
                expect(result.headings[1].depth).toBe(2);
                expect(result.headings[2].text).toBe("Subsection");
                expect(result.headings[2].depth).toBe(3);
            });
        });

        describe("when content has fenced code blocks", () => {
            it("should extract code block value and language", () => {
                // Arrange
                const content =
                    "# Title\n\n```bash\nnpm test\n```\n\nSome text\n";

                // Act
                const result = gateway.parseContent(content);

                // Assert
                expect(result.codeBlocks).toHaveLength(1);
                expect(result.codeBlocks[0].value).toBe("npm test");
                expect(result.codeBlocks[0].lang).toBe("bash");
            });
        });

        describe("when content has inline code", () => {
            it("should extract inline code values", () => {
                // Arrange
                const content = "Run `npm test` before committing.\n";

                // Act
                const result = gateway.parseContent(content);

                // Assert
                expect(result.inlineCodes).toHaveLength(1);
                expect(result.inlineCodes[0].value).toBe("npm test");
            });
        });

        describe("when content is empty", () => {
            it("should return empty arrays", () => {
                // Act
                const result = gateway.parseContent("");

                // Assert
                expect(result.headings).toHaveLength(0);
                expect(result.codeBlocks).toHaveLength(0);
                expect(result.inlineCodes).toHaveLength(0);
            });
        });
    });
});

describe("findConditionalKeywordsInProximity", () => {
    const gateway = new RemarkMarkdownAstGateway();

    describe("when a paragraph following a code block contains conditional keywords", () => {
        it("should return true", () => {
            // Arrange
            const content =
                "```bash\nnpm test\n```\n\nIf any tests fail, fix them before proceeding.\n";
            const structure = gateway.parseContent(content);

            // Act
            const result = gateway.findConditionalKeywordsInProximity(
                structure,
                0,
                3,
                ["if", "fail", "fix"],
            );

            // Assert
            expect(result).toBe(true);
        });
    });

    describe("when no conditional keywords are within the proximity window", () => {
        it("should return false", () => {
            // Arrange
            const content =
                "```bash\nnpm test\n```\n\nThen run the build step.\n";
            const structure = gateway.parseContent(content);

            // Act
            const result = gateway.findConditionalKeywordsInProximity(
                structure,
                0,
                3,
                ["if", "fail", "fix"],
            );

            // Assert
            expect(result).toBe(false);
        });
    });
});
