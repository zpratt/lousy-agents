/**
 * The most bytes of an instruction file that lint and doctor read. Import
 * expansion, the instruction readers and doctor's file reads all use this one
 * number, and the advisories that tell a user a file was too large describe it
 * with {@link describeByteLimit}, so the cap and its text cannot drift.
 */
export const MAX_INSTRUCTION_FILE_BYTES = 1_048_576;

const BYTES_PER_MIB = 1_048_576;

/**
 * A byte limit in words a reader can check a file against: a whole number of
 * mebibytes ("1 MiB"), or the exact number of bytes, never a rounded figure.
 */
export function describeByteLimit(bytes: number): string {
    return bytes % BYTES_PER_MIB === 0
        ? `${bytes / BYTES_PER_MIB} MiB`
        : `${bytes} bytes`;
}
