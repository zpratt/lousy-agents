import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter.js";

describe("parseFrontmatter", () => {
    describe("given content with valid YAML frontmatter", () => {
        it("should parse the frontmatter data", () => {
            // Arrange
            const content =
                "---\nname: my-skill\ndescription: A skill\n---\n# Content\n";

            // Act
            const result = parseFrontmatter(content);

            // Assert
            expect(result).not.toBeNull();
            expect(result?.data.name).toBe("my-skill");
            expect(result?.data.description).toBe("A skill");
        });

        it("should track field line numbers", () => {
            // Arrange
            const content = "---\nname: my-skill\ndescription: A skill\n---\n";

            // Act
            const result = parseFrontmatter(content);

            // Assert
            expect(result?.fieldLines.get("name")).toBe(2);
            expect(result?.fieldLines.get("description")).toBe(3);
        });

        it("should set frontmatterStartLine to 1", () => {
            // Arrange
            const content = "---\nname: my-skill\n---\n";

            // Act
            const result = parseFrontmatter(content);

            // Assert
            expect(result?.frontmatterStartLine).toBe(1);
        });
    });

    describe("given content with hyphenated field names", () => {
        it("should track line numbers for hyphenated fields", () => {
            // Arrange
            const content = "---\nname: my-skill\nallowed-tools: tool1\n---\n";

            // Act
            const result = parseFrontmatter(content);

            // Assert
            expect(result?.fieldLines.get("allowed-tools")).toBe(3);
            expect(result?.data["allowed-tools"]).toBe("tool1");
        });
    });

    describe("given content without frontmatter", () => {
        it("should return null", () => {
            // Arrange
            const content = "# Just a heading\nSome content\n";

            // Act
            const result = parseFrontmatter(content);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe("given content with unclosed frontmatter", () => {
        it("should return null", () => {
            // Arrange
            const content = "---\nname: my-skill\n";

            // Act
            const result = parseFrontmatter(content);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe("given content with invalid YAML", () => {
        it("should return null instead of throwing", () => {
            // Arrange
            const content = "---\n: invalid:\n  - :\n---\n";

            // Act
            const result = parseFrontmatter(content);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe("given frontmatter that parses to a non-object value", () => {
        it("should return an empty data object", () => {
            // Arrange — YAML that parses to a string, not an object
            const content = "---\njust a string\n---\n";

            // Act
            const result = parseFrontmatter(content);

            // Assert
            expect(result).not.toBeNull();
            expect(result?.data).toEqual({});
        });
    });
});
