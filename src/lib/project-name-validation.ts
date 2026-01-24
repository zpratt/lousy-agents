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
 * A validation rule that checks a condition and returns an error message if invalid
 */
type ValidationRule = (name: string) => string | undefined;

/**
 * Pattern for valid npm package name segments (scope or package name)
 */
const NPM_NAME_PATTERN = /^[a-z0-9][-a-z0-9._]*$/;

/**
 * Maximum allowed length for npm package names
 */
const MAX_NAME_LENGTH = 214;

/**
 * Creates validation result from error message (undefined = valid)
 */
const toResult = (
    errorMessage: string | undefined,
): ProjectNameValidationResult =>
    errorMessage ? { isValid: false, errorMessage } : { isValid: true };

/**
 * Runs validation rules in order, returning first failure or success
 */
const runValidationRules = (
    name: string,
    rules: ValidationRule[],
): ProjectNameValidationResult => {
    for (const rule of rules) {
        const error = rule(name);
        if (error) {
            return toResult(error);
        }
    }
    return toResult(undefined);
};

// ============================================================================
// Validation Rules
// ============================================================================

const requiredRule: ValidationRule = (name) =>
    !name || name.length === 0 ? "Project name is required" : undefined;

const maxLengthRule: ValidationRule = (name) =>
    name.length > MAX_NAME_LENGTH
        ? "Project name must be 214 characters or less"
        : undefined;

const noLeadingDotOrUnderscoreRule: ValidationRule = (name) =>
    name.startsWith(".") || name.startsWith("_")
        ? "Project name cannot start with . or _"
        : undefined;

const validCharactersRule: ValidationRule = (name) =>
    !NPM_NAME_PATTERN.test(name)
        ? "Project name must be lowercase and can only contain letters, numbers, hyphens, underscores, and periods"
        : undefined;

// ============================================================================
// Scoped Package Validation
// ============================================================================

const validateScopedName = (name: string): ProjectNameValidationResult => {
    const parts = name.split("/");

    const scopeFormatRule: ValidationRule = () =>
        parts.length !== 2
            ? "Scoped package name must be in format @scope/name"
            : undefined;

    const scopeNotEmptyRule: ValidationRule = () =>
        parts[0].length < 2 ? "Scope name cannot be empty" : undefined;

    const scopeValidRule: ValidationRule = () => {
        const scope = parts[0].slice(1); // Remove leading @
        return !NPM_NAME_PATTERN.test(scope)
            ? "Scope must be lowercase and can only contain letters, numbers, hyphens, underscores, and periods"
            : undefined;
    };

    const packageNameNotEmptyRule: ValidationRule = () =>
        !parts[1] || parts[1].length === 0
            ? "Package name after scope cannot be empty"
            : undefined;

    const packageNameValidRule: ValidationRule = () =>
        !NPM_NAME_PATTERN.test(parts[1])
            ? "Package name must be lowercase and can only contain letters, numbers, hyphens, underscores, and periods"
            : undefined;

    const scopedRules: ValidationRule[] = [
        scopeFormatRule,
        scopeNotEmptyRule,
        scopeValidRule,
        packageNameNotEmptyRule,
        packageNameValidRule,
    ];

    return runValidationRules(name, scopedRules);
};

// ============================================================================
// Unscoped Package Validation
// ============================================================================

const validateUnscopedName = (name: string): ProjectNameValidationResult => {
    const unscopedRules: ValidationRule[] = [
        noLeadingDotOrUnderscoreRule,
        validCharactersRule,
    ];

    return runValidationRules(name, unscopedRules);
};

// ============================================================================
// Main Validation Function
// ============================================================================

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
    // Common rules that apply to all package names
    const commonRules: ValidationRule[] = [requiredRule, maxLengthRule];

    const commonResult = runValidationRules(name, commonRules);
    if (!commonResult.isValid) {
        return commonResult;
    }

    // Route to scoped or unscoped validation
    return name.startsWith("@")
        ? validateScopedName(name)
        : validateUnscopedName(name);
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
