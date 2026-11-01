/**
 * Bounded, verified reads of a single regular file.
 *
 * Unlike `readFileNoFollow`, which throws, `readRegularFileNoFollow` reports
 * every refusal as a value, bounds the bytes it reads, and verifies the opened
 * file is the file it was asked to read.
 */

import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

function isEloopError(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ELOOP";
}

/** Identity of a file on disk; equal identities are the same inode. */
export interface FileIdentity {
    readonly dev: number | bigint;
    readonly ino: number | bigint;
}

export interface NoFollowStats extends FileIdentity {
    readonly size: number;
    readonly nlink: number;
    isFile(): boolean;
    isSymbolicLink(): boolean;
}

export interface NoFollowFileHandle {
    stat(): Promise<NoFollowStats>;
    read(
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null,
    ): Promise<{ readonly bytesRead: number }>;
    close(): Promise<void>;
}

/**
 * The slice of the file system the bounded reader needs. Injectable so
 * races between the check and the read can be tested deterministically.
 */
export interface NoFollowFsPort {
    open(path: string, flags: number): Promise<NoFollowFileHandle>;
    lstat(path: string): Promise<NoFollowStats>;
}

const nodeFsPort: NoFollowFsPort = {
    open: (path, flags) => open(path, flags),
    lstat: (path) => lstat(path),
};

export type BoundedReadFailure =
    | "symlink"
    | "not-regular"
    | "hard-linked"
    | "too-large"
    | "identity-mismatch"
    | "unreadable";

export type BoundedReadOutcome =
    | { readonly ok: true; readonly content: string }
    | { readonly ok: false; readonly reason: BoundedReadFailure };

export interface BoundedReadOptions {
    /** Identity recorded when the path was checked; the opened file must match */
    readonly expectedIdentity?: FileIdentity;
    readonly fs?: NoFollowFsPort;
}

const READ_CHUNK_BYTES = 64 * 1024;

function isSameFile(a: FileIdentity, b: FileIdentity): boolean {
    return a.dev === b.dev && a.ino === b.ino;
}

function hasKernelNoFollow(): boolean {
    return (
        typeof constants.O_NOFOLLOW === "number" && constants.O_NOFOLLOW !== 0
    );
}

type OpenResult =
    | { readonly handle: NoFollowFileHandle }
    | { readonly failure: BoundedReadFailure };

/**
 * Without kernel O_NOFOLLOW support, a symlink is rejected up front with lstat.
 */
async function isSymlinkWithoutKernelSupport(
    fs: NoFollowFsPort,
    filePath: string,
): Promise<boolean> {
    if (hasKernelNoFollow()) {
        return false;
    }
    return (await fs.lstat(filePath)).isSymbolicLink();
}

async function openForBoundedRead(
    fs: NoFollowFsPort,
    filePath: string,
): Promise<OpenResult> {
    try {
        if (await isSymlinkWithoutKernelSupport(fs, filePath)) {
            return { failure: "symlink" };
        }
        const flags = hasKernelNoFollow()
            ? constants.O_RDONLY | constants.O_NOFOLLOW
            : constants.O_RDONLY;
        return { handle: await fs.open(filePath, flags) };
    } catch (error: unknown) {
        return { failure: isEloopError(error) ? "symlink" : "unreadable" };
    }
}

/**
 * Reads at most maxBytes + 1 bytes, so a file that grows after it was
 * measured can never make the read unbounded. Returns null when the file
 * holds more than maxBytes.
 */
async function readAtMost(
    handle: NoFollowFileHandle,
    maxBytes: number,
): Promise<string | null> {
    const chunks: Buffer[] = [];
    let total = 0;

    while (true) {
        const want = Math.min(READ_CHUNK_BYTES, maxBytes + 1 - total);
        const chunk = Buffer.alloc(want);
        const { bytesRead } = await handle.read(chunk, 0, want, null);
        if (bytesRead === 0) {
            return Buffer.concat(chunks).toString("utf8");
        }
        chunks.push(chunk.subarray(0, bytesRead));
        total += bytesRead;
        if (total > maxBytes) {
            return null;
        }
    }
}

/**
 * Verifies the opened descriptor is a plain regular file that is still the
 * file at the path (and the file that was checked earlier, when an identity
 * was recorded). Returns the failure, or null when the file is acceptable.
 */
async function checkOpenedFile(
    fs: NoFollowFsPort,
    handle: NoFollowFileHandle,
    filePath: string,
    maxBytes: number,
    expectedIdentity: FileIdentity | undefined,
): Promise<BoundedReadFailure | null> {
    const opened = await handle.stat();
    if (!opened.isFile()) {
        return "not-regular";
    }
    // Defense in depth: a hard link may alias a file outside the root. This
    // only fires locally (for example pnpm stores or `cp -al` trees).
    if (opened.nlink > 1) {
        return "hard-linked";
    }
    if (
        expectedIdentity !== undefined &&
        !isSameFile(opened, expectedIdentity)
    ) {
        return "identity-mismatch";
    }

    const atPath = await fs.lstat(filePath);
    if (!atPath.isFile() || !isSameFile(opened, atPath)) {
        return "identity-mismatch";
    }

    return opened.size > maxBytes ? "too-large" : null;
}

/**
 * Reads a regular file without following a symlink at the final path
 * component, never throwing for an unacceptable file.
 *
 * Opens with O_NOFOLLOW (an ELOOP is a "symlink" outcome), checks on the open
 * descriptor that it is a plain regular file within the size cap and the same
 * file that is currently at the path, then reads at most maxBytes + 1 bytes.
 * Pass the real (symlink-free) path of a file inside the root: O_NOFOLLOW
 * protects only the final component.
 */
export async function readRegularFileNoFollow(
    filePath: string,
    maxBytes: number,
    options: BoundedReadOptions = {},
): Promise<BoundedReadOutcome> {
    const fs = options.fs ?? nodeFsPort;
    const opened = await openForBoundedRead(fs, filePath);
    if ("failure" in opened) {
        return { ok: false, reason: opened.failure };
    }

    const { handle } = opened;
    try {
        const failure = await checkOpenedFile(
            fs,
            handle,
            filePath,
            maxBytes,
            options.expectedIdentity,
        );
        if (failure !== null) {
            return { ok: false, reason: failure };
        }

        const content = await readAtMost(handle, maxBytes);
        return content === null
            ? { ok: false, reason: "too-large" }
            : { ok: true, content };
    } catch {
        return { ok: false, reason: "unreadable" };
    } finally {
        await handle.close().catch(() => undefined);
    }
}
