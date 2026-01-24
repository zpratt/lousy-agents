/**
 * Project name validation utilities for npm/TypeScript projects.
 * This module provides validation for project names that can be reused
 * across different project types (webapp, CLI, probot, MCP server, etc.).
 */

/**
 * Result of project name validation
 */
export interface ProjectNameValidationResult {
    isValid: boolean;
    errorMessage?: string;
}

/**
 * Validates that a project name is a valid npm package name.
 * Supports both unscoped (e.g., "my-package") and scoped (e.g., "@scope/my-package") names.
 *
 * Based on npm naming rules:
 * - Lowercase only
 * - No spaces
 * - Can contain hyphens, underscores, periods, and numbers
 * - Unscoped names cannot start with . or _
 * - Maximum 214 characters
 *
 * @param name The project name to validate
 * @returns Validation result with isValid flag and optional error message
 */
export function validateProjectName(name: string): ProjectNameValidationResult {
    if (!name || name.length === 0) {
        return {
            isValid: false,
            errorMessage: "Project name is required",
        };
    }

    if (name.length > 214) {
        return {
            isValid: false,
            errorMessage: "Project name must be 214 characters or less",
        };
    }

    // Pattern for unscoped package names: starts with lowercase letter or number,
    // followed by lowercase letters, numbers, hyphens, underscores, or periods
    const unscopedPattern = /^[a-z0-9][-a-z0-9._]*$/;

    // Handle scoped package names: @scope/name
    if (name.startsWith("@")) {
        const parts = name.split("/");
        if (parts.length !== 2) {
            return {
                isValid: false,
                errorMessage:
                    "Scoped package name must be in format @scope/name",
            };
        }

        const [rawScope, packageName] = parts;

        // Scope should be @scopename (at least 2 chars including @)
        if (rawScope.length < 2) {
            return {
                isValid: false,
                errorMessage: "Scope name cannot be empty",
            };
        }

        const scope = rawScope.slice(1); // Remove leading @

        // Scope pattern: starts with lowercase letter or number
        const scopePattern = /^[a-z0-9][-a-z0-9._]*$/;
        if (!scopePattern.test(scope)) {
            return {
                isValid: false,
                errorMessage:
                    "Scope must be lowercase and can only contain letters, numbers, hyphens, underscores, and periods",
            };
        }

        if (!packageName || packageName.length === 0) {
            return {
                isValid: false,
                errorMessage: "Package name after scope cannot be empty",
            };
        }

        if (!unscopedPattern.test(packageName)) {
            return {
                isValid: false,
                errorMessage:
                    "Package name must be lowercase and can only contain letters, numbers, hyphens, underscores, and periods",
            };
        }

        return { isValid: true };
    }

    // Unscoped package name validation
    if (name.startsWith(".") || name.startsWith("_")) {
        return {
            isValid: false,
            errorMessage: "Project name cannot start with . or _",
        };
    }

    if (!unscopedPattern.test(name)) {
        return {
            isValid: false,
            errorMessage:
                "Project name must be lowercase and can only contain letters, numbers, hyphens, underscores, and periods",
        };
    }

    return { isValid: true };
}

/**
 * Simple boolean check for project name validity.
 * Use validateProjectName() when you need the error message.
 *
 * @param name The project name to validate
 * @returns true if the name is valid, false otherwise
 */
export function isValidProjectName(name: string): boolean {
    return validateProjectName(name).isValid;
}

/**
 * Gets a user-friendly error message for an invalid project name.
 *
 * @param name The project name that was validated
 * @returns Error message describing why the name is invalid, or undefined if valid
 */
export function getProjectNameError(name: string): string | undefined {
    return validateProjectName(name).errorMessage;
}
