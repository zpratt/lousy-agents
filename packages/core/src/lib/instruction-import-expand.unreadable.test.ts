import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRegularFileNoFollow } from "../gateways/read-regular-file-no-follow.js";
import { inspectPathWithinRoot } from "../gateways/real-path-within-root.js";
import {
    buildEffectiveDocument,
    type ImportFileSystem,
} from "./instruction-import-expand.js";

const IMPORT_UNRESOLVED_RULE_ID = "instruction/import-unresolved";

const unreadableMessage = (rawTarget: string): string =>
    `Import target could not be read, for example because access was denied or too many files were open: ${rawTarget}`;

const REFUSED_FILE_NAMES = ["a.md", "notes"];

const isRefused = (path: string): boolean =>
    REFUSED_FILE_NAMES.some((name) => path.endsWith(`/${name}`));

const systemRefusesToLook: Partial<ImportFileSystem> = {
    inspect: async (rootReal, absolutePath) =>
        isRefused(absolutePath)
            ? { status: "unreadable" }
            : inspectPathWithinRoot(rootReal, absolutePath),
};

const systemRefusesToOpen: Partial<ImportFileSystem> = {
    read: async (realPath, maxBytes, expectedIdentity) =>
        isRefused(realPath)
            ? { ok: false, reason: "unreadable" }
            : readRegularFileNoFollow(realPath, maxBytes, { expectedIdentity }),
};

const fileChangesAfterInspection: Partial<ImportFileSystem> = {
    inspect: async (rootReal, absolutePath) => {
        const inspection = await inspectPathWithinRoot(rootReal, absolutePath);
        if (inspection.status !== "ok" || !isRefused(absolutePath)) {
            return inspection;
        }
        const { ino } = inspection.identity;
        return {
            ...inspection,
            identity: {
                dev: inspection.identity.dev,
                ino: typeof ino === "bigint" ? ino + 1n : ino + 1,
            },
        };
    },
};

describe("buildEffectiveDocument when the system will not let it look at or open an import target", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await mkdtemp(join(tmpdir(), "import-expand-unreadable-"));
        await mkdir(join(repoRoot, "docs"));
        await writeFile(join(repoRoot, "docs", "a.md"), "A-BODY\n");
        await writeFile(join(repoRoot, "notes"), "NOTES-BODY\n");
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    describe.each([
        ["refuses to look at the target", systemRefusesToLook],
        ["refuses to open the target", systemRefusesToOpen],
        [
            "has a different file at the target than the one it inspected",
            fileChangesAfterInspection,
        ],
    ])("given the system %s", (_situation, fileSystem) => {
        it("should leave the token unexpanded and report the edge as unreadable", async () => {
            await writeFile(join(repoRoot, "CLAUDE.md"), "@./docs/a.md\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                fileSystem,
            });

            expect(result.content).toBe("@./docs/a.md\n");
            expect(result.edges).toHaveLength(1);
            expect(result.edges[0]?.status).toBe("unreadable");
        });

        it("should say the target could not be read instead of saying it could not be resolved", async () => {
            await writeFile(join(repoRoot, "CLAUDE.md"), "@./docs/a.md\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                fileSystem,
            });

            expect(result.expansionDiagnostics).toHaveLength(1);
            expect(result.expansionDiagnostics[0]).toMatchObject({
                ruleId: IMPORT_UNRESOLVED_RULE_ID,
                message: unreadableMessage("./docs/a.md"),
                filePath: "CLAUDE.md",
            });
        });

        it("should report a bare token that does not look like a path, because it cannot be told from a real import", async () => {
            await writeFile(join(repoRoot, "CLAUDE.md"), "@notes\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                fileSystem,
            });

            expect(result.edges[0]?.status).toBe("unreadable");
            expect(result.expansionDiagnostics).toHaveLength(1);
            expect(result.expansionDiagnostics[0]?.message).toBe(
                unreadableMessage("notes"),
            );
        });
    });
});
