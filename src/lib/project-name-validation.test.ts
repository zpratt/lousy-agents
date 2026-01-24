import { describe, expect, it } from "vitest";
import {
    getProjectNameError,
    isValidProjectName,
    validateProjectName,
} from "./project-name-validation.js";

describe("Project Name Validation", () => {
    describe("validateProjectName", () => {
        describe("valid unscoped package names", () => {
            it("should accept lowercase alphabetic names", () => {
                // Arrange
                const name = "myproject";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
                expect(result.errorMessage).toBeUndefined();
            });

            it("should accept names with hyphens", () => {
                // Arrange
                const name = "my-valid-project";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
            });

            it("should accept names with underscores", () => {
                // Arrange
                const name = "my_valid_project";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
            });

            it("should accept names with periods", () => {
                // Arrange
                const name = "my.valid.project";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
            });

            it("should accept names starting with numbers", () => {
                // Arrange
                const name = "123project";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
            });

            it("should accept names with mixed valid characters", () => {
                // Arrange
                const name = "my-project_v1.0";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
            });
        });

        describe("valid scoped package names", () => {
            it("should accept scoped names with simple scope and package", () => {
                // Arrange
                const name = "@myorg/mypackage";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
            });

            it("should accept scoped names with hyphens in scope", () => {
                // Arrange
                const name = "@my-org/my-package";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
            });

            it("should accept scoped names with underscores and periods", () => {
                // Arrange
                const name = "@my_org/my.package";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
            });

            it("should accept scoped names starting with numbers", () => {
                // Arrange
                const name = "@123org/456package";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(true);
            });
        });

        describe("invalid package names", () => {
            it("should reject empty names", () => {
                // Arrange
                const name = "";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
                expect(result.errorMessage).toBe("Project name is required");
            });

            it("should reject names exceeding 214 characters", () => {
                // Arrange
                const name = "a".repeat(215);

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
                expect(result.errorMessage).toBe(
                    "Project name must be 214 characters or less",
                );
            });

            it("should reject names starting with period", () => {
                // Arrange
                const name = ".myproject";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
                expect(result.errorMessage).toBe(
                    "Project name cannot start with . or _",
                );
            });

            it("should reject names starting with underscore", () => {
                // Arrange
                const name = "_myproject";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
                expect(result.errorMessage).toBe(
                    "Project name cannot start with . or _",
                );
            });

            it("should reject names with uppercase letters", () => {
                // Arrange
                const name = "MyProject";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
            });

            it("should reject names with spaces", () => {
                // Arrange
                const name = "my project";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
            });

            it("should reject names with special characters", () => {
                // Arrange
                const name = "my@project";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
            });
        });

        describe("invalid scoped package names", () => {
            it("should reject scoped names without package name", () => {
                // Arrange
                const name = "@myorg/";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
                expect(result.errorMessage).toBe(
                    "Package name after scope cannot be empty",
                );
            });

            it("should reject scoped names with empty scope", () => {
                // Arrange
                const name = "@/mypackage";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
                expect(result.errorMessage).toBe("Scope name cannot be empty");
            });

            it("should reject scoped names with multiple slashes", () => {
                // Arrange
                const name = "@myorg/sub/package";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
                expect(result.errorMessage).toBe(
                    "Scoped package name must be in format @scope/name",
                );
            });

            it("should reject scoped names with uppercase in scope", () => {
                // Arrange
                const name = "@MyOrg/mypackage";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
            });

            it("should reject scoped names with uppercase in package", () => {
                // Arrange
                const name = "@myorg/MyPackage";

                // Act
                const result = validateProjectName(name);

                // Assert
                expect(result.isValid).toBe(false);
            });
        });
    });

    describe("isValidProjectName", () => {
        it("should return true for valid names", () => {
            // Arrange
            const name = "valid-project";

            // Act
            const result = isValidProjectName(name);

            // Assert
            expect(result).toBe(true);
        });

        it("should return false for invalid names", () => {
            // Arrange
            const name = "Invalid Project";

            // Act
            const result = isValidProjectName(name);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe("getProjectNameError", () => {
        it("should return undefined for valid names", () => {
            // Arrange
            const name = "valid-project";

            // Act
            const result = getProjectNameError(name);

            // Assert
            expect(result).toBeUndefined();
        });

        it("should return error message for invalid names", () => {
            // Arrange
            const name = "";

            // Act
            const result = getProjectNameError(name);

            // Assert
            expect(result).toBe("Project name is required");
        });
    });
});
