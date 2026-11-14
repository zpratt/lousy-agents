import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    collapseToFirstRealFile,
    discoverInstructionLocations,
} from "./agentic-artifact-discovery.js";
import type { WalkedFile } from "./repository-walk.js";

describe("discoverInstructionLocations", () => {
    let testDir = "";

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    async function makeRepo(): Promise<string> {
        testDir = join(
            tmpdir(),
            `instruction-locations-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        );
        await mkdir(testDir, { recursive: true });
        return testDir;
    }

    it("should return the instruction file ten directories below .github/instructions and not the one eleven below", async () => {
        const root = await makeRepo();
        const atLimit = [
            ".github",
            "instructions",
            ...Array.from({ length: 10 }, (_, index) => String(index + 1)),
            "at-limit.instructions.md",
        ];
        const pastLimit = [
            ".github",
            "instructions",
            ...Array.from({ length: 11 }, (_, index) => String(index + 1)),
            "past-limit.instructions.md",
        ];
        await mkdir(join(root, ...atLimit.slice(0, -1)), { recursive: true });
        await mkdir(join(root, ...pastLimit.slice(0, -1)), {
            recursive: true,
        });
        await writeFile(join(root, ...atLimit), "# at limit\n");
        await writeFile(join(root, ...pastLimit), "# past limit\n");

        const walks = await discoverInstructionLocations(root, {
            rootDirectoryName: "repo",
        });
        const paths = walks.flatMap((walk) =>
            walk.walked.files.map((file) => file.relativePath),
        );

        expect(paths).toContain(atLimit.join("/"));
        expect(paths).not.toContain(pastLimit.join("/"));
    });

    it("should return both logical paths when two instruction directories alias one real directory", async () => {
        const root = await makeRepo();
        const shared = join(root, ".github", "shared");
        await mkdir(shared, { recursive: true });
        await writeFile(join(shared, "x.instructions.md"), "# shared\n");
        const instructions = join(root, ".github", "instructions");
        await mkdir(instructions, { recursive: true });
        await symlink(shared, join(instructions, "b-alias"));
        await symlink(shared, join(instructions, "a-alias"));

        const walks = await discoverInstructionLocations(root, {
            rootDirectoryName: "repo",
        });
        const paths = walks
            .filter((walk) => walk.role === "catalog")
            .flatMap((walk) =>
                walk.walked.files.map((file) => file.relativePath),
            )
            .sort();

        expect(paths).toEqual([
            ".github/instructions/a-alias/x.instructions.md",
            ".github/instructions/b-alias/x.instructions.md",
        ]);
    });

    it("should keep b-extra rather than b when those aliases name one instruction file", async () => {
        const root = await makeRepo();
        const shared = join(root, ".github", "shared");
        await mkdir(shared, { recursive: true });
        await writeFile(join(shared, "x.instructions.md"), "# shared\n");
        const instructions = join(root, ".github", "instructions");
        await mkdir(instructions, { recursive: true });
        await symlink(shared, join(instructions, "b"));
        await symlink(shared, join(instructions, "b-extra"));

        const walks = await discoverInstructionLocations(root, {
            rootDirectoryName: "repo",
        });
        const files =
            walks.find((walk) => walk.format === "copilot-scoped")?.walked
                .files ?? [];

        expect(
            collapseToFirstRealFile(files).map((file) => file.relativePath),
        ).toEqual([".github/instructions/b-extra/x.instructions.md"]);
    });

    it("should skip the nested root walk when the caller asks for catalog walks only", async () => {
        const root = await makeRepo();

        const walks = await discoverInstructionLocations(root, {
            rootDirectoryName: "repo",
            includeNestedWalk: false,
        });

        expect(walks.every((walk) => walk.role === "catalog")).toBe(true);
    });
});

describe("collapseToFirstRealFile", () => {
    it("should keep the first logical path in code-unit order for one real file", () => {
        const identity = { dev: 1, ino: 2 };
        const files: WalkedFile[] = [
            {
                relativePath: ".github/instructions/b-alias/x.instructions.md",
                real: "/shared/x.instructions.md",
                identity,
            },
            {
                relativePath: ".github/instructions/a-alias/x.instructions.md",
                real: "/shared/x.instructions.md",
                identity,
            },
        ];

        expect(
            collapseToFirstRealFile(files).map((file) => file.relativePath),
        ).toEqual([".github/instructions/a-alias/x.instructions.md"]);
    });
});
