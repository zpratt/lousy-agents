// biome-ignore-all lint/style/useNamingConvention: Claude settings JSON requires PascalCase hook event names

import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

/**
 * Error-path tests for InitHooksConfigGateway that require intercepting
 * specific node:fs/promises calls (open, rename, unlink).
 *
 * Strategy:
 * - vi.mock wraps open/rename/unlink with vi.fn() spies.
 *   importOriginal() provides the actual (un-mocked) implementations inside
 *   the factory closure — these are used as the spy's default implementation.
 * - beforeAll fetches the actual module via vi.importActual() so per-test
 *   mockImplementation overrides can call through to the real fs.
 *   (We cannot store these in module-level variables because vi.mock is hoisted
 *   above all module-level declarations and assignments.)
 */
type FsPromises = typeof import("node:fs/promises");

vi.mock("node:fs/promises", async (importOriginal) => {
    // importOriginal() returns the actual (un-mocked) module inside the factory
    const mod = await importOriginal<FsPromises>();
    return {
        ...mod,
        // Wrap only the functions we need to intercept in tests
        open: vi.fn((...args: Parameters<FsPromises["open"]>) =>
            // @ts-expect-error — TypeScript cannot verify parameter types when forwarding variadic arguments to overloaded function signatures
            mod.open(...args),
        ),
        rename: vi.fn((...args: Parameters<FsPromises["rename"]>) =>
            mod.rename(...args),
        ),
        unlink: vi.fn((...args: Parameters<FsPromises["unlink"]>) =>
            mod.unlink(...args),
        ),
    };
});

// biome-ignore lint/performance/noNamespaceImport: namespace import required for vi.mocked() spy interception — vi.mocked(fsPromises.open) must reference the same spy object bound by vi.mock
import * as fsPromises from "node:fs/promises";
import { InitHooksConfigGateway } from "./init-hooks-config-gateway.js";

function tmpDir() {
    return join(process.cwd(), ".test-tmp", randomBytes(8).toString("hex"));
}

describe("InitHooksConfigGateway error paths", () => {
    // Actual (un-mocked) fs functions fetched once after module load.
    // Cannot use module-level vars because vi.mock is hoisted above all
    // module-level declarations and runs before they are initialised.
    let realFs: FsPromises;
    let testDir: string;

    beforeAll(async () => {
        realFs = await vi.importActual<FsPromises>("node:fs/promises");
    });

    beforeEach(async () => {
        testDir = tmpDir();
        await mkdir(testDir, { recursive: true });
        // Reset all spies to the default pass-through before each test
        vi.mocked(fsPromises.open).mockImplementation(
            // @ts-expect-error — TypeScript cannot verify parameter types when forwarding variadic arguments to overloaded function signatures
            (...args: Parameters<FsPromises["open"]>) => realFs.open(...args),
        );
        vi.mocked(fsPromises.rename).mockImplementation(
            (...args: Parameters<FsPromises["rename"]>) =>
                realFs.rename(...args),
        );
        vi.mocked(fsPromises.unlink).mockImplementation(
            (...args: Parameters<FsPromises["unlink"]>) =>
                realFs.unlink(...args),
        );
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    describe("when open throws EEXIST on the temp-file write", () => {
        it("throws a descriptive error naming the potential collision or attack", async () => {
            // Intercept only O_WRONLY opens (the temp file write); pass all
            // other opens through to the real fs so realpath/readFileNoFollow work.
            let writeOpenCount = 0;
            vi.mocked(fsPromises.open).mockImplementation(
                async (...args: Parameters<FsPromises["open"]>) => {
                    const flags = args[1];
                    // O_WRONLY === 1; present in all O_WRONLY open calls for writing
                    if (
                        typeof flags === "number" &&
                        // biome-ignore lint/suspicious/noExplicitAny: numeric flags bitmask
                        (flags & (1 as any)) !== 0
                    ) {
                        writeOpenCount++;
                        if (writeOpenCount === 1) {
                            throw Object.assign(
                                new Error("EEXIST: file already exists"),
                                { code: "EEXIST" },
                            );
                        }
                    }
                    // @ts-expect-error — TypeScript cannot verify parameter types when forwarding variadic arguments to overloaded function signatures
                    return realFs.open(...args);
                },
            );

            const gateway = new InitHooksConfigGateway();
            await expect(
                gateway.initHooks(testDir, {
                    addSessionStart: false,
                    force: false,
                }),
            ).rejects.toThrow(
                "Temp file already exists (possible collision or attack)",
            );
        });
    });

    describe("when rename fails after the temp file is written", () => {
        it("cleans up the temp file and re-throws the rename error", async () => {
            const unlinkSpy = vi.mocked(fsPromises.unlink);

            let renameAttempts = 0;
            vi.mocked(fsPromises.rename).mockImplementation(
                async (...args: Parameters<FsPromises["rename"]>) => {
                    renameAttempts++;
                    if (renameAttempts === 1) {
                        throw Object.assign(
                            new Error("EACCES: permission denied"),
                            { code: "EACCES" },
                        );
                    }
                    return realFs.rename(...args);
                },
            );

            const gateway = new InitHooksConfigGateway();
            await expect(
                gateway.initHooks(testDir, {
                    addSessionStart: false,
                    force: false,
                }),
            ).rejects.toThrow("EACCES: permission denied");

            // The gateway must attempt to unlink the temp file on rename failure
            expect(unlinkSpy).toHaveBeenCalledOnce();
            const unlinkedPath = String(unlinkSpy.mock.calls[0][0]);
            expect(unlinkedPath).toContain(".claude");
            expect(unlinkedPath).toContain(".tmp");
        });

        it("still propagates the rename error even when unlink itself fails", async () => {
            vi.mocked(fsPromises.unlink).mockRejectedValueOnce(
                new Error("unlink itself failed"),
            );

            let renameAttempts = 0;
            vi.mocked(fsPromises.rename).mockImplementation(
                async (...args: Parameters<FsPromises["rename"]>) => {
                    renameAttempts++;
                    if (renameAttempts === 1) {
                        throw Object.assign(
                            new Error("EACCES: permission denied"),
                            { code: "EACCES" },
                        );
                    }
                    return realFs.rename(...args);
                },
            );

            const gateway = new InitHooksConfigGateway();
            await expect(
                gateway.initHooks(testDir, {
                    addSessionStart: false,
                    force: false,
                }),
            ).rejects.toThrow("EACCES: permission denied");
        });
    });
});
