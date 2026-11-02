import { execFile } from "node:child_process";
import {
    chmod,
    mkdir,
    mkdtemp,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
    type NoFollowFsPort,
    readRegularFileNoFollow,
} from "@lousy-agents/core/gateways/read-regular-file-no-follow.js";
import {
    buildEffectiveDocument,
    type ImportFileSystem,
} from "@lousy-agents/core/lib/instruction-import-expand.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseRawEdges } from "../lib/edge-parser.js";
import { resolveEdge } from "./edge-resolution.js";
import { createTargetClassifier } from "./target-classifier.js";

const runFile = promisify(execFile);

const REFUSED_FILE_NAMES = ["a.md", "notes"];
const IMPORTER = "CLAUDE.md";

const isRefused = (path: string): boolean =>
    REFUSED_FILE_NAMES.some((name) => path.endsWith(`/${name}`));

function refusingToOpen(code: string): NoFollowFsPort {
    const refuse = async (path: string) => {
        throw Object.assign(new Error(code), { code, path });
    };
    return { open: refuse, lstat: refuse };
}

const lintCannotOpen: Partial<ImportFileSystem> = {
    read: async (realPath, maxBytes, expectedIdentity) =>
        isRefused(realPath)
            ? { ok: false, reason: "unreadable" }
            : readRegularFileNoFollow(realPath, maxBytes, { expectedIdentity }),
};

describe("lint and doctor on an import target the system will not let them look at or open", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await realpath(
            await mkdtemp(join(tmpdir(), "import-parity-")),
        );
        await mkdir(join(repoRoot, "docs"));
        await writeFile(join(repoRoot, "docs", "a.md"), "A-BODY\n");
        await writeFile(join(repoRoot, "notes"), "NOTES-BODY\n");
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    async function lintEdgeStatuses(
        content: string,
        fileSystem?: Partial<ImportFileSystem>,
    ): Promise<string[]> {
        await writeFile(join(repoRoot, IMPORTER), content);
        const result = await buildEffectiveDocument({
            repoRoot,
            rootRelativePath: IMPORTER,
            fileSystem,
        });
        return result.edges.map((edge) => edge.status);
    }

    async function doctorEdgeReasons(
        content: string,
        fs?: NoFollowFsPort,
    ): Promise<(string | undefined)[]> {
        const classifyTarget = createTargetClassifier(repoRoot, { fs });
        const edges = await Promise.all(
            parseRawEdges(content).map((raw) =>
                resolveEdge(raw, join(repoRoot, IMPORTER), IMPORTER, {
                    repoRoot,
                    rootReal: repoRoot,
                    existingAbsPaths: new Set(),
                    classifyTarget,
                }),
            ),
        );
        return edges.flatMap((edge) =>
            edge === null ? [] : [edge.malformed ? edge.reason : undefined],
        );
    }

    describe.each([
        ["a path", "@./docs/a.md\n"],
        ["a bare token that does not look like a path", "@notes\n"],
    ])("given %s the system refuses to open", (_kind, content) => {
        it("should have lint and doctor both report the import as unreadable", async () => {
            const lint = await lintEdgeStatuses(content, lintCannotOpen);
            const doctor = await doctorEdgeReasons(
                content,
                refusingToOpen("EACCES"),
            );

            expect({ lint, doctor }).toEqual({
                lint: ["unreadable"],
                doctor: ["unreadable"],
            });
        });
    });

    describe("given a directory the process may not look through", () => {
        const cannotDenyAccess =
            process.platform === "win32" || process.getuid?.() === 0;

        describe.each([
            ["a path", "@./closed/a.md\n"],
            ["a bare token that does not look like a path", "@closed/notes\n"],
        ])("given %s into it", (_kind, content) => {
            it.skipIf(cannotDenyAccess)(
                "should have lint and doctor both report the import as unreadable, and neither as missing",
                async () => {
                    const closed = join(repoRoot, "closed");
                    await mkdir(closed);
                    await writeFile(join(closed, "a.md"), "CLOSED\n");
                    await writeFile(join(closed, "notes"), "CLOSED\n");
                    await chmod(closed, 0o000);

                    try {
                        const lint = await lintEdgeStatuses(content);
                        const doctor = await doctorEdgeReasons(content);

                        expect({ lint, doctor }).toEqual({
                            lint: ["unreadable"],
                            doctor: ["unreadable"],
                        });
                    } finally {
                        await chmod(closed, 0o700);
                    }
                },
            );
        });
    });

    describe("given a path the file system cannot represent", () => {
        it.each([
            ["a name too long to exist", `@./${"a".repeat(300)}.md\n`],
            ["a name holding a NUL byte", "@./nul\u0000x.md\n"],
        ])(
            "should have lint report %s as unresolved and doctor as a missing target",
            async (_kind, content) => {
                const lint = await lintEdgeStatuses(content);
                const doctor = await doctorEdgeReasons(content);

                expect({ lint, doctor }).toEqual({
                    lint: ["unresolved"],
                    doctor: ["missing-target"],
                });
            },
        );
    });

    describe("given a target that exists but is not a regular file", () => {
        const cannotMakeSpecialFiles = process.platform === "win32";

        describe.each([
            ["a path", "@./pipe.md\n"],
            ["a bare token that does not look like a path", "@pipe\n"],
        ])("given %s to a named pipe", (_kind, content) => {
            it.skipIf(cannotMakeSpecialFiles)(
                "should have lint and doctor both report it as not a regular file, and neither as missing",
                async () => {
                    const pipeName = content.includes("pipe.md")
                        ? "pipe.md"
                        : "pipe";
                    await runFile("mkfifo", [join(repoRoot, pipeName)]);

                    const lint = await lintEdgeStatuses(content);
                    const doctor = await doctorEdgeReasons(content);

                    expect({ lint, doctor }).toEqual({
                        lint: ["not-regular"],
                        doctor: ["not-regular"],
                    });
                },
            );
        });

        it.skipIf(cannotMakeSpecialFiles)(
            "should have lint and doctor both report a symbolic link that leads back to itself as not a regular file",
            async () => {
                await symlink("loop.md", join(repoRoot, "loop.md"));
                const content = "@./loop.md\n";

                const lint = await lintEdgeStatuses(content);
                const doctor = await doctorEdgeReasons(content);

                expect({ lint, doctor }).toEqual({
                    lint: ["not-regular"],
                    doctor: ["not-regular"],
                });
            },
        );
    });
});
