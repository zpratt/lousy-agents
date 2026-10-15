/**
 * Escapes ASCII and C1 control characters in error messages before writing
 * to stderr. Replaces each control character with its `\xNN` hex
 * representation to prevent log/terminal injection when errors embed
 * untrusted data.
 */
export function sanitizeForStderr(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control characters for sanitization
    return msg.replace(/[\u0000-\u001f\u007f-\u009f]/g, (ch) => {
        return `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;
    });
}

/**
 * Escapes ASCII and C1 control characters (except newline) in output text.
 * Like sanitizeForStderr but preserves newlines for JSON formatting.
 */
export function sanitizeOutput(text: string): string {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control characters for sanitization
    return text.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, (ch) => {
        return `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;
    });
}

/**
 * Sanitizes untrusted values before embedding in prompts.
 * Strips newlines and all backticks that could inject instructions,
 * and truncates to a safe length.
 */
export function sanitizePromptValue(value: string): string {
    return value
        .replace(/[\n\r]/g, " ")
        .replace(/`/g, "")
        .slice(0, 256);
}

/**
 * Shell metacharacters that indicate compound or piped commands.
 * Commands containing these are excluded from the allow list because
 * they could mask injection (e.g. `npm test && curl evil`).
 */
export const SHELL_METACHAR_PATTERN = /[;|&`><$()\\\n\r]/;

/**
 * Returns true if the command is non-empty, contains no shell metacharacters,
 * and is safe to include in a policy allow list.
 */
export function isSafeCommand(command: string): boolean {
    const normalized = command.trim();
    if (normalized.length === 0) {
        return false;
    }
    return !SHELL_METACHAR_PATTERN.test(normalized);
}
