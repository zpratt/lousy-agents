/**
 * Public lint API error types.
 *
 * Kept separate from filesystem-backed validation internals so the public
 * package barrel can export stable error contracts without depending on
 * implementation modules.
 */

/**
 * Thrown when user-supplied directory input fails validation.
 *
 * Consumers can catch this type to distinguish user-input errors
 * (bad path, missing directory) from system-level errors (EACCES, EMFILE).
 */
export class LintValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "LintValidationError";
    }
}
