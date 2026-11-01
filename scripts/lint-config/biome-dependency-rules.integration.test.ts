import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const BIOME = resolve(repositoryRoot, "node_modules/.bin/biome");

const UNDECLARED = "lint/correctness/noUndeclaredDependencies";
const CYCLE = "lint/suspicious/noImportCycles";
const RESTRICTED = "lint/style/noRestrictedImports";

const OWN_DEPENDENCY = "dep-of-a";
const ROOT_ONLY_DEPENDENCY = "tool-of-the-root";

const reportSchema = z.object({
    diagnostics: z.array(
        z.object({
            category: z.string().optional(),
            location: z.object({ path: z.string() }).optional(),
        }),
    ),
});

interface Finding {
    readonly rule: string;
    readonly file: string;
}

// Written out here, not read from biome.json, so a module dropped from the
// configuration fails this test instead of silently leaving it.
const DEPRECATED_MODULES = [
    "punycode",
    "sys",
    "domain",
    "constants",
    "_http_agent",
    "_http_client",
    "_http_common",
    "_http_incoming",
    "_http_outgoing",
    "_http_server",
    "_linklist",
    "_stream_duplex",
    "_stream_passthrough",
    "_stream_readable",
    "_stream_transform",
    "_stream_wrap",
    "_stream_writable",
    "_tls_common",
    "_tls_wrap",
] as const;

function deprecatedModuleFiles(): Record<string, string> {
    return Object.fromEntries(
        DEPRECATED_MODULES.flatMap((name) =>
            [
                [`packages/a/src/deprecated/${name}.ts`, name],
                [`packages/a/src/deprecated/node-${name}.ts`, `node:${name}`],
            ].map(([path, specifier]) => [
                path,
                `import imported from "${specifier}";\nexport const used = imported;\n`,
            ]),
        ),
    );
}

const FILES: Readonly<Record<string, string>> = {
    ...deprecatedModuleFiles(),
    "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        workspaces: ["packages/a", "packages/b"],
        devDependencies: { [ROOT_ONLY_DEPENDENCY]: "1.0.0" },
    }),
    "packages/a/package.json": JSON.stringify({
        name: "a",
        dependencies: { [OWN_DEPENDENCY]: "1.0.0" },
    }),
    "packages/b/package.json": JSON.stringify({ name: "b" }),
    // packages/a declares what it imports
    "packages/a/src/uses-own.ts": `import { x } from "${OWN_DEPENDENCY}";\nexport const used = x;\n`,
    "packages/a/src/uses-subpath.ts": `import { x } from "${OWN_DEPENDENCY}/sub";\nexport const used = x;\n`,
    "packages/a/src/uses-node.ts": `import { readFile } from "node:fs/promises";\nexport const used = readFile;\n`,
    // packages/b declares nothing: not a sibling's dependency, not the root's
    "packages/b/src/borrows-sibling.ts": `import { x } from "${OWN_DEPENDENCY}";\nexport const used = x;\n`,
    "packages/b/src/borrows-root.ts": `import { x } from "${ROOT_ONLY_DEPENDENCY}";\nexport const used = x;\n`,
    // tests and tool configuration use the root's tooling by design
    "packages/b/src/borrows-root.test.ts": `import { x } from "${ROOT_ONLY_DEPENDENCY}";\nexport const used = x;\n`,
    "packages/b/tests/borrows-root.ts": `import { x } from "${ROOT_ONLY_DEPENDENCY}";\nexport const used = x;\n`,
    "packages/b/rspack.config.ts": `import { x } from "${ROOT_ONLY_DEPENDENCY}";\nexport default x;\n`,
    // a runtime import cycle
    "packages/b/src/cycle-one.ts": `import { two } from "./cycle-two.js";\nexport const one = () => two;\n`,
    "packages/b/src/cycle-two.ts": `import { one } from "./cycle-one.js";\nexport const two = () => one;\n`,
    // a cycle that exists only in types
    "packages/b/src/types-one.ts": `import type { Two } from "./types-two.js";\nexport type One = { two: Two };\n`,
    "packages/b/src/types-two.ts": `import type { One } from "./types-one.js";\nexport type Two = { one: One };\n`,
};

async function createFixture(): Promise<string> {
    const root = await mkdtemp(join(await realpath(tmpdir()), "biome-deps-"));
    await cp(resolve(repositoryRoot, "biome.json"), join(root, "biome.json"));
    for (const [path, content] of Object.entries(FILES)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), content);
    }
    await execFileAsync("git", ["init", "--quiet"], { cwd: root });
    return root;
}

function isOutput(error: unknown): error is { stdout: string } {
    return (
        typeof error === "object" &&
        error !== null &&
        "stdout" in error &&
        typeof error.stdout === "string"
    );
}

async function biomeFindings(root: string): Promise<Finding[]> {
    const args = ["check", "--reporter=json", "--max-diagnostics=none", "."];
    let stdout: string;
    try {
        ({ stdout } = await execFileAsync(BIOME, args, { cwd: root }));
    } catch (error) {
        if (!isOutput(error)) {
            throw error;
        }
        stdout = error.stdout;
    }
    const report = reportSchema.parse(JSON.parse(stdout));
    return report.diagnostics.flatMap((diagnostic) =>
        diagnostic.category !== undefined &&
        [UNDECLARED, CYCLE, RESTRICTED].includes(diagnostic.category) &&
        diagnostic.location !== undefined
            ? [{ rule: diagnostic.category, file: diagnostic.location.path }]
            : [],
    );
}

describe("the repository's Biome configuration, applied to a small workspace", () => {
    let root: string;
    let findings: Finding[];

    beforeAll(async () => {
        root = await createFixture();
        findings = await biomeFindings(root);
    });

    afterAll(async () => {
        await rm(root, { recursive: true, force: true });
    });

    function filesFlaggedFor(rule: string): string[] {
        return findings
            .filter((finding) => finding.rule === rule)
            .map((finding) => finding.file)
            .sort();
    }

    describe("noUndeclaredDependencies", () => {
        it("should read each file against its own package's package.json, not a sibling's or the root's", () => {
            // Act
            const flagged = filesFlaggedFor(UNDECLARED);

            // Assert
            expect(flagged).toEqual([
                "packages/b/src/borrows-root.ts",
                "packages/b/src/borrows-sibling.ts",
            ]);
        });

        it("should accept a package's own dependency, a subpath of it, and node: modules", () => {
            // Act
            const flagged = filesFlaggedFor(UNDECLARED);

            // Assert
            expect(
                flagged.filter((file) => file.startsWith("packages/a/")),
            ).toEqual([]);
        });

        it("should leave tests and tool configuration free to use the root's tooling", () => {
            // Act
            const flagged = filesFlaggedFor(UNDECLARED);

            // Assert
            expect(flagged).not.toContain(
                "packages/b/src/borrows-root.test.ts",
            );
            expect(flagged).not.toContain("packages/b/tests/borrows-root.ts");
            expect(flagged).not.toContain("packages/b/rspack.config.ts");
        });
    });

    describe("noRestrictedImports", () => {
        it("should flag every deprecated Node core module, in both spellings", () => {
            // Act
            const flagged = filesFlaggedFor(RESTRICTED);

            // Assert
            expect(flagged).toEqual(
                Object.keys(deprecatedModuleFiles()).sort(),
            );
            expect(flagged).toHaveLength(DEPRECATED_MODULES.length * 2);
        });

        it("should leave current Node core modules alone", () => {
            // Act
            const flagged = filesFlaggedFor(RESTRICTED);

            // Assert
            expect(flagged).not.toContain("packages/a/src/uses-node.ts");
        });
    });

    describe("noImportCycles", () => {
        it("should flag a cycle of runtime imports", () => {
            // Act
            const flagged = filesFlaggedFor(CYCLE);

            // Assert
            expect(flagged.some((file) => file.includes("cycle-"))).toBe(true);
        });

        it("should flag a cycle that exists only in types too", () => {
            // Act
            const flagged = filesFlaggedFor(CYCLE);

            // Assert
            expect(flagged.some((file) => file.includes("types-"))).toBe(true);
        });
    });
});
