/** Maximum bytes to buffer from stdin (hook JSON payloads should be small). */
export const STDIN_MAX_BYTES = 1_048_576; // 1 MB

export type StdinResult = { text: string; capped: boolean };

/**
 * Reads stdin into memory up to STDIN_MAX_BYTES. Returns { text, capped } where
 * `capped` is true when the limit was exceeded (and the stream was paused).
 * I/O errors are treated as empty (not capped): the caller proceeds normally
 * with empty text, which falls through existing stdin-empty handling paths.
 */
export function readStdin(): Promise<StdinResult> {
    return new Promise((fulfill) => {
        if (process.stdin.isTTY) {
            fulfill({ text: "", capped: false });
            return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let capped = false;
        process.stdin.on("data", (chunk: Buffer) => {
            if (capped) return;
            totalBytes += chunk.length;
            if (totalBytes > STDIN_MAX_BYTES) {
                capped = true;
                // Pause the stream so Node stops reading immediately,
                // keeping the process responsive instead of draining the payload.
                if (typeof process.stdin.pause === "function") {
                    process.stdin.pause();
                }
                fulfill({ text: "", capped: true });
                return;
            }
            chunks.push(chunk);
        });
        process.stdin.on("end", () => {
            if (capped) return;
            fulfill({
                text: Buffer.concat(chunks).toString("utf8"),
                capped: false,
            });
        });
        // The capped guard prevents a double-fulfill if the stream emits an
        // error after the size cap has already fired.
        process.stdin.on("error", () => {
            if (capped) return;
            fulfill({ text: "", capped: false });
        });
    });
}
