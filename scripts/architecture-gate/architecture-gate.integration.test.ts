import { execFile } from "node:child_process";
import {
    appendFile,
    cp,
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POLICY_PATH } from "./policy-path.js";
import { runArchitectureGate } from "./run-gate.js";
import { spawnCoach } from "./spawn-coach.js";

const execFileAsync = promisify(execFile);

const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const GATE_ENTRY = resolve(
    repositoryRoot,
    "scripts/architecture-gate/architecture-gate.ts",
);
const TSX = resolve(repositoryRoot, "node_modules/.bin/tsx");

// Coach needs a supported Node first on PATH; use the one running this test.
const ENVIRONMENT = {
    ...process.env,
    // biome-ignore lint/style/useNamingConvention: environment variable name
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
    // biome-ignore lint/style/useNamingConvention: environment variable name
    GIT_CONFIG_GLOBAL: "/dev/null",
    // biome-ignore lint/style/useNamingConvention: environment variable name
    GIT_CONFIG_NOSYSTEM: "1",
};

const CORE_ENTITY = "packages/core/src/entities/entity.ts";
const CORE_USE_CASE = "packages/core/src/use-cases/use-case.ts";
const CORE_GATEWAY = "packages/core/src/gateways/gateway.ts";
const CORE_LIB = "packages/core/src/lib/helper.ts";
const CORE_FORMATTER = "packages/core/src/formatters/formatter.ts";
const CORE_INDEX = "packages/core/src/index.ts";
const AGENT_SHELL_GATEWAY = "packages/agent-shell/src/gateways/gateway.ts";
const DOCTOR_GATEWAY = "packages/doctor/src/gateways/gateway.ts";
const DOCTOR_FORMATTER = "packages/doctor/src/formatters/formatter.ts";
const DOCTOR_CLI = "packages/doctor/src/cli/index.ts";
const ACTION_INDEX = "packages/action/src/index.ts";
const ACTION_RUN_LINT = "packages/action/src/run-lint.ts";
const LINT_ERRORS_TO_RUNNER = "lint_errors->composition_root";
const LINT_INDEX = "packages/lint/src/index.ts";
const LINT_RUNNER = "packages/lint/src/lint.ts";
const LINT_DIRECTORY = "packages/lint/src/validate-directory.ts";
const LINT_ERRORS = "packages/lint/src/lint-errors.ts";
const DOCTOR_INDEX = "packages/doctor/src/index.ts";
const CLI_COMMAND = "packages/cli/src/commands/use-doctor.ts";
const SCAFFOLD_TEMPLATE = "packages/cli/api/copilot-with-fastify/src/app.ts";
const TOOLING_CONFIG = "packages/doctor/vitest.config.ts";

type ImportForm =
    | "value"
    | "import-type"
    | "export-type"
    | "inline-type-import"
    | "inline-type-export"
    | "dynamic-import"
    | "require";

interface Edge {
    readonly importer: string;
    readonly importee: string;
    /** Import specifier to write instead of the relative path */
    readonly specifier?: string;
    /** How the import is written; a plain value import when left out */
    readonly form?: ImportForm;
}

interface ForbiddenEdge extends Edge {
    readonly pair: string;
}

// One deliberate violation for each target of each dependency-cruiser rule,
// plus the same rules across packages and by package name.
const FORBIDDEN: readonly ForbiddenEdge[] = [
    // 1. core entities must not import core use cases
    edge(
        "packages/core/src/entities/imports-use-case.ts",
        CORE_USE_CASE,
        "entities->use_cases",
    ),
    // 2. core entities must not import gateways, lib or formatters
    edge(
        "packages/core/src/entities/imports-gateway.ts",
        CORE_GATEWAY,
        "entities->adapters",
    ),
    edge(
        "packages/core/src/entities/imports-lib.ts",
        CORE_LIB,
        "entities->adapters",
    ),
    edge(
        "packages/core/src/entities/imports-formatter.ts",
        CORE_FORMATTER,
        "entities->formatters",
    ),
    // 3. core use cases must not import gateways, lib or formatters
    edge(
        "packages/core/src/use-cases/imports-gateway.ts",
        CORE_GATEWAY,
        "use_cases->adapters",
    ),
    edge(
        "packages/core/src/use-cases/imports-lib.ts",
        CORE_LIB,
        "use_cases->adapters",
    ),
    edge(
        "packages/core/src/use-cases/imports-formatter.ts",
        CORE_FORMATTER,
        "use_cases->formatters",
    ),
    // 4. core gateways, lib and formatters must not import core's index
    edge(
        "packages/core/src/gateways/imports-index.ts",
        CORE_INDEX,
        "adapters->core_barrel",
    ),
    edge(
        "packages/core/src/lib/imports-index.ts",
        CORE_INDEX,
        "adapters->core_barrel",
    ),
    edge(
        "packages/core/src/formatters/imports-index.ts",
        CORE_INDEX,
        "formatters->core_barrel",
    ),
    // 5. core entities must not import core's index
    edge(
        "packages/core/src/entities/imports-index.ts",
        CORE_INDEX,
        "entities->core_barrel",
    ),
    // 6. core use cases must not import core's index
    edge(
        "packages/core/src/use-cases/imports-index.ts",
        CORE_INDEX,
        "use_cases->core_barrel",
    ),
    // 7. lint-errors must not import any other lint file
    edge(LINT_ERRORS, LINT_RUNNER, LINT_ERRORS_TO_RUNNER),
    edge(LINT_ERRORS, LINT_INDEX, "lint_errors->lint_api"),
    edge(LINT_ERRORS, LINT_DIRECTORY, "lint_errors->lint_validate_directory"),
    // 8. lint's index must not import validate-directory directly
    edge(LINT_INDEX, LINT_DIRECTORY, "lint_api->lint_validate_directory"),
    // 9. lint files other than the runner must not import core gateways, lib or use cases
    edge(LINT_INDEX, CORE_GATEWAY, "lint_api->adapters"),
    edge(LINT_INDEX, CORE_LIB, "lint_api->adapters"),
    edge(LINT_INDEX, CORE_USE_CASE, "lint_api->use_cases"),
    edge(LINT_DIRECTORY, CORE_GATEWAY, "lint_validate_directory->adapters"),
    edge(LINT_DIRECTORY, CORE_LIB, "lint_validate_directory->adapters"),
    edge(LINT_DIRECTORY, CORE_USE_CASE, "lint_validate_directory->use_cases"),
    edge(LINT_ERRORS, CORE_GATEWAY, "lint_errors->adapters"),
    edge(LINT_ERRORS, CORE_LIB, "lint_errors->adapters"),
    edge(LINT_ERRORS, CORE_USE_CASE, "lint_errors->use_cases"),
    // package_api barrels are importable by adapters and roots, never by the inner layers
    edge(
        "packages/core/src/entities/imports-doctor-api.ts",
        DOCTOR_INDEX,
        "entities->package_api",
    ),
    edge(
        "packages/core/src/use-cases/imports-doctor-api.ts",
        DOCTOR_INDEX,
        "use_cases->package_api",
    ),
    // lint's entry point is a package API too, and the rest of lint is its own
    edge(
        "packages/core/src/entities/imports-lint-api.ts",
        LINT_INDEX,
        "entities->lint_api",
    ),
    edge(
        "packages/core/src/use-cases/imports-lint-api.ts",
        LINT_INDEX,
        "use_cases->lint_api",
    ),
    edge(
        "packages/core/src/entities/imports-lint-directory.ts",
        LINT_DIRECTORY,
        "entities->lint_validate_directory",
    ),
    edge(
        "packages/core/src/entities/imports-lint-errors.ts",
        LINT_ERRORS,
        "entities->lint_errors",
    ),
    edge(
        "packages/core/src/use-cases/imports-lint-directory.ts",
        LINT_DIRECTORY,
        "use_cases->lint_validate_directory",
    ),
    edge(
        "packages/core/src/use-cases/imports-lint-errors.ts",
        LINT_ERRORS,
        "use_cases->lint_errors",
    ),
    // The same rules hold in agent-shell and doctor, not only in core
    edge(
        "packages/agent-shell/src/entities/imports-gateway.ts",
        AGENT_SHELL_GATEWAY,
        "entities->adapters",
    ),
    edge(
        "packages/agent-shell/src/use-cases/imports-gateway.ts",
        AGENT_SHELL_GATEWAY,
        "use_cases->adapters",
    ),
    edge(
        "packages/doctor/src/entities/imports-formatter.ts",
        DOCTOR_FORMATTER,
        "entities->formatters",
    ),
    edge(
        "packages/doctor/src/use-cases/imports-formatter.ts",
        DOCTOR_FORMATTER,
        "use_cases->formatters",
    ),
    // doctor's standalone CLI wires dependencies, so it is a composition root, not an adapter
    edge(
        "packages/doctor/src/gateways/imports-cli.ts",
        DOCTOR_CLI,
        "adapters->composition_root",
    ),
    edge(
        "packages/doctor/src/use-cases/imports-cli.ts",
        DOCTOR_CLI,
        "use_cases->composition_root",
    ),
    // only the Action's entry point is a composition root
    edge(ACTION_RUN_LINT, ACTION_INDEX, "adapters->composition_root"),
    // Imports that are not value imports. Coach reads them through tsc, and
    // a coach release that stopped counting one would weaken the gate.
    written(
        "import-type",
        "packages/core/src/entities/imports-gateway-as-import-type.ts",
        CORE_GATEWAY,
        "entities->adapters",
    ),
    written(
        "export-type",
        "packages/core/src/entities/imports-gateway-as-export-type.ts",
        CORE_GATEWAY,
        "entities->adapters",
    ),
    written(
        "inline-type-import",
        "packages/core/src/entities/imports-gateway-as-inline-type-import.ts",
        CORE_GATEWAY,
        "entities->adapters",
    ),
    written(
        "inline-type-export",
        "packages/core/src/entities/imports-gateway-as-inline-type-export.ts",
        CORE_GATEWAY,
        "entities->adapters",
    ),
    written(
        "dynamic-import",
        "packages/core/src/entities/imports-gateway-as-dynamic-import.ts",
        CORE_GATEWAY,
        "entities->adapters",
    ),
    written(
        "require",
        "packages/core/src/entities/imports-gateway-as-require.ts",
        CORE_GATEWAY,
        "entities->adapters",
    ),
    // Production code and the scaffold templates it writes stay apart
    edge(
        "packages/core/src/gateways/imports-template.ts",
        SCAFFOLD_TEMPLATE,
        "adapters->scaffold_templates",
    ),
    edge(
        "packages/cli/api/copilot-with-fastify/src/imports-entity.ts",
        CORE_ENTITY,
        "scaffold_templates->entities",
    ),
    // Production code must not import build and test tooling
    edge(
        "packages/core/src/lib/imports-tooling.ts",
        TOOLING_CONFIG,
        "adapters->tooling",
    ),
    // Other packages reach lint through its package API only
    edge(
        "packages/cli/src/commands/imports-lint-errors.ts",
        LINT_ERRORS,
        "adapters->lint_errors",
    ),
    edge(
        "packages/core/src/formatters/imports-validate-directory.ts",
        LINT_DIRECTORY,
        "formatters->lint_validate_directory",
    ),
    // The same layers across packages, reached by package name
    {
        importer: "packages/doctor/src/entities/via-package-name.ts",
        importee: CORE_LIB,
        specifier: "@lousy-agents/core/lib/helper.js",
        pair: "entities->adapters",
    },
];

// Imports the architecture allows; they must never be reported.
const ALLOWED: readonly Edge[] = [
    { importer: CORE_USE_CASE, importee: CORE_ENTITY },
    // a type-only import the policy allows is no more a violation than a value one
    {
        importer: "packages/core/src/gateways/imports-entity-as-type.ts",
        importee: CORE_ENTITY,
        form: "import-type",
    },
    { importer: CORE_GATEWAY, importee: CORE_USE_CASE },
    { importer: CORE_GATEWAY, importee: CORE_ENTITY },
    { importer: CORE_FORMATTER, importee: CORE_ENTITY },
    { importer: CORE_INDEX, importee: CORE_USE_CASE },
    { importer: CORE_INDEX, importee: CORE_GATEWAY },
    { importer: LINT_RUNNER, importee: CORE_GATEWAY },
    { importer: LINT_RUNNER, importee: CORE_LIB },
    { importer: LINT_RUNNER, importee: CORE_USE_CASE },
    { importer: LINT_RUNNER, importee: LINT_DIRECTORY },
    { importer: LINT_RUNNER, importee: LINT_ERRORS },
    { importer: LINT_INDEX, importee: CORE_FORMATTER },
    { importer: LINT_INDEX, importee: CORE_ENTITY },
    { importer: LINT_INDEX, importee: LINT_RUNNER },
    { importer: LINT_INDEX, importee: LINT_ERRORS },
    { importer: LINT_DIRECTORY, importee: LINT_ERRORS },
    { importer: CLI_COMMAND, importee: DOCTOR_INDEX },
    { importer: DOCTOR_CLI, importee: DOCTOR_GATEWAY },
    { importer: DOCTOR_CLI, importee: DOCTOR_INDEX },
    { importer: ACTION_INDEX, importee: ACTION_RUN_LINT },
    { importer: ACTION_RUN_LINT, importee: LINT_INDEX },
];

function edge(importer: string, importee: string, pair: string): ForbiddenEdge {
    return { importer, importee, pair };
}

/** A forbidden import that is not written as a plain value import. */
function written(
    form: ImportForm,
    importer: string,
    importee: string,
    pair: string,
): ForbiddenEdge {
    return { importer, importee, pair, form };
}

function specifierFor(candidate: Edge): string {
    if (candidate.specifier !== undefined) {
        return candidate.specifier;
    }
    const relative = posix.relative(
        posix.dirname(candidate.importer),
        candidate.importee.replace(/\.ts$/, ".js"),
    );
    return relative.startsWith(".") ? relative : `./${relative}`;
}

interface ImportStatement {
    readonly lines: readonly string[];
    /** Expression for the value array, when the import can be used as a value */
    readonly use?: string;
}

function statementFor(candidate: Edge, index: number): ImportStatement {
    const from = `"${specifierFor(candidate)}"`;
    const imported = `imported${index}`;
    const typeOfImported = `export type Used${index} = typeof ${imported};`;
    switch (candidate.form ?? "value") {
        case "import-type":
            return {
                lines: [
                    `import type { value as ${imported} } from ${from};`,
                    typeOfImported,
                ],
            };
        case "export-type":
            return {
                lines: [
                    `export type { value as reexported${index} } from ${from};`,
                ],
            };
        case "inline-type-import":
            return {
                lines: [
                    `import { type value as ${imported} } from ${from};`,
                    typeOfImported,
                ],
            };
        case "inline-type-export":
            return {
                lines: [
                    `export { type value as reexported${index} } from ${from};`,
                ],
            };
        case "dynamic-import":
            return {
                lines: [`export const load${index} = () => import(${from});`],
            };
        case "require":
            return {
                lines: [
                    "declare const require: (id: string) => unknown;",
                    `export const required${index} = require(${from});`,
                ],
            };
        default:
            return {
                lines: [`import { value as ${imported} } from ${from};`],
                use: imported,
            };
    }
}

function moduleSource(path: string, imports: readonly Edge[]): string {
    const statements = imports
        .filter((candidate) => candidate.importer === path)
        .map(statementFor);
    const uses = statements.flatMap((statement) => statement.use ?? []);
    return [
        ...new Set(statements.flatMap((statement) => statement.lines)),
        `export const value = [${["1", ...uses].join(", ")}];`,
        "",
    ].join("\n");
}

async function writeModule(
    root: string,
    path: string,
    imports: readonly Edge[],
): Promise<void> {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, moduleSource(path, imports));
}

async function git(root: string, ...args: string[]): Promise<void> {
    await execFileAsync(
        "git",
        [
            "-c",
            "user.name=fixture",
            "-c",
            "user.email=fixture@example.com",
            ...args,
        ],
        { cwd: root, env: ENVIRONMENT },
    );
}

async function linkCompiler(root: string): Promise<void> {
    const modules = join(root, "node_modules");
    await mkdir(join(modules, "@lousy-agents"), { recursive: true });
    for (const name of ["typescript", "@typescript"]) {
        await symlink(
            join(repositoryRoot, "node_modules", name),
            join(modules, name),
        );
    }
    await symlink(
        "../../packages/core",
        join(modules, "@lousy-agents", "core"),
    );
}

async function writeWorkspaceFiles(root: string): Promise<void> {
    const rootManifest = JSON.parse(
        await readFile(join(repositoryRoot, "package.json"), "utf8"),
    );
    const compilerVersion = rootManifest.devDependencies.typescript;
    await writeFile(
        join(root, "package.json"),
        JSON.stringify({
            name: "fixture",
            private: true,
            type: "module",
            devDependencies: { typescript: compilerVersion },
        }),
    );
    await writeFile(
        join(root, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: {
                target: "ES2022",
                module: "ESNext",
                moduleResolution: "bundler",
                strict: true,
                noEmit: true,
                skipLibCheck: true,
            },
            include: ["packages/**/*.ts"],
        }),
    );
    await mkdir(join(root, "packages/core"), { recursive: true });
    await writeFile(
        join(root, "packages/core/package.json"),
        JSON.stringify({
            name: "@lousy-agents/core",
            type: "module",
            exports: { "./lib/*": "./src/lib/*" },
        }),
    );
    await writeFile(join(root, ".gitignore"), "node_modules\n");
}

function modulePathsOf(edges: readonly Edge[]): string[] {
    return [...new Set(edges.flatMap((e) => [e.importer, e.importee]))].sort();
}

async function createRepository(
    imports: readonly Edge[],
    policyPath: string,
    extraModules: readonly string[] = [],
): Promise<string> {
    const root = await mkdtemp(
        join(await realpath(tmpdir()), "architecture-gate-"),
    );
    await writeWorkspaceFiles(root);
    await mkdir(dirname(join(root, POLICY_PATH)), { recursive: true });
    await cp(policyPath, join(root, POLICY_PATH));
    for (const path of [
        ...modulePathsOf([...FORBIDDEN, ...ALLOWED]),
        ...extraModules,
    ]) {
        await writeModule(root, path, imports);
    }
    await linkCompiler(root);
    await git(root, "init", "--quiet", "--initial-branch=main");
    await git(root, "add", "--all");
    await git(root, "commit", "--quiet", "--message", "fixture");
    return root;
}

function runGateIn(root: string) {
    return runArchitectureGate((args) =>
        spawnCoach(args, { cwd: root, env: ENVIRONMENT }),
    );
}

interface FailedProcess {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}

function isFailedProcess(error: unknown): error is FailedProcess {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "number" &&
        "stdout" in error &&
        typeof error.stdout === "string" &&
        "stderr" in error &&
        typeof error.stderr === "string"
    );
}

async function runEntryIn(root: string, env: NodeJS.ProcessEnv = ENVIRONMENT) {
    try {
        const { stdout, stderr } = await execFileAsync(TSX, [GATE_ENTRY], {
            cwd: root,
            env,
        });
        return { exitCode: 0, stdout, stderr };
    } catch (error) {
        if (!isFailedProcess(error)) {
            throw error;
        }
        return {
            exitCode: error.code,
            stdout: error.stdout,
            stderr: error.stderr,
        };
    }
}

describe(`the architecture gate, against coach and the committed ${POLICY_PATH}`, () => {
    const policyPath = resolve(repositoryRoot, POLICY_PATH);
    const created: string[] = [];
    let violating: string;
    let compliant: string;

    beforeAll(async () => {
        violating = await createRepository(
            [...FORBIDDEN, ...ALLOWED],
            policyPath,
        );
        compliant = await createRepository(ALLOWED, policyPath);
        created.push(violating, compliant);
    });

    afterAll(async () => {
        await Promise.all(
            created.map((root) => rm(root, { recursive: true, force: true })),
        );
    });

    describe("when imports break the layering rules", () => {
        it("should fail and report each deliberate violation, and none of the allowed imports", async () => {
            // Arrange
            const expected = FORBIDDEN.map(
                (candidate) =>
                    `  ${candidate.importer} -> ${candidate.importee} (${candidate.pair})`,
            ).sort();

            // Act
            const verdict = await runGateIn(violating);

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.slice(1).sort()).toEqual(expected);
        });

        it("should exit 1 and name the violations when run as the lint step does", async () => {
            // Act
            const run = await runEntryIn(violating);

            // Assert
            expect(run.exitCode).toBe(1);
            expect(run.stderr).toContain("architecture gate: FAILED");
            expect(run.stderr).toContain(
                `${LINT_ERRORS} -> ${LINT_RUNNER} (${LINT_ERRORS_TO_RUNNER})`,
            );
        });
    });

    describe("when the deliberate violations are removed", () => {
        it("should pass, leaving only the allowed imports", async () => {
            // Act
            const verdict = await runGateIn(compliant);

            // Assert
            expect(verdict).toEqual({ passed: true, messages: [] });
        });

        it("should exit 0 when run as the lint step does", async () => {
            // Act
            const run = await runEntryIn(compliant);

            // Assert
            expect(run.exitCode).toBe(0);
            expect(run.stdout).toContain("no layer violations");
        });
    });

    describe("when a committed file sits outside every declared layer", () => {
        it("should fail and say that imports to or from it are not checked", async () => {
            // Arrange
            const root = await createRepository(ALLOWED, policyPath, [
                "packages/core/src/unlayered/orphan.ts",
            ]);
            created.push(root);

            // Act
            const verdict = await runGateIn(root);

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.join("\n")).toMatch(
                /^1 of \d+ files coach analyzed sit outside every declared layer/m,
            );
        });
    });

    describe("when the working tree has uncommitted changes", () => {
        const NoticeStart =
            "architecture gate: coach analyzed the committed HEAD only;";

        async function freshRepository(imports: readonly Edge[]) {
            const root = await createRepository(imports, policyPath);
            created.push(root);
            return root;
        }

        it("should say coach analyzed HEAD only and name the edited file, without changing the exit code", async () => {
            // Arrange
            const root = await freshRepository(ALLOWED);
            await appendFile(join(root, CORE_ENTITY), "// edited\n");

            // Act
            const run = await runEntryIn(root);

            // Assert
            expect(run.exitCode).toBe(0);
            expect(run.stderr).toContain(
                `${NoticeStart} 1 uncommitted change under packages/ was not checked (${CORE_ENTITY}). Commit it to include it, or run \`mise run coach-worktree\` to scan it first.`,
            );
        });

        it("should name a new file git does not track yet", async () => {
            // Arrange
            const root = await freshRepository(ALLOWED);
            const newFile = "packages/core/src/entities/brand-new.ts";
            await writeFile(join(root, newFile), "export const value = 1;\n");

            // Act
            const run = await runEntryIn(root);

            // Assert
            expect(run.exitCode).toBe(0);
            expect(run.stderr).toContain(`not checked (${newFile})`);
        });

        it("should still fail the gate for a violation and print the notice as well", async () => {
            // Arrange
            const root = await freshRepository([...FORBIDDEN, ...ALLOWED]);
            await appendFile(join(root, CORE_ENTITY), "// edited\n");

            // Act
            const run = await runEntryIn(root);

            // Assert
            expect(run.exitCode).toBe(1);
            expect(run.stderr).toContain(NoticeStart);
            expect(run.stderr).toContain("architecture gate: FAILED");
        });

        it("should say nothing when everything is committed", async () => {
            // Act
            const run = await runEntryIn(compliant);

            // Assert
            expect(run.exitCode).toBe(0);
            expect(run.stderr).not.toContain("uncommitted");
        });

        it("should say nothing about changes outside packages/", async () => {
            // Arrange
            const root = await freshRepository(ALLOWED);
            await writeFile(join(root, "README.md"), "# notes\n");
            await appendFile(join(root, "tsconfig.json"), "\n");

            // Act
            const run = await runEntryIn(root);

            // Assert
            expect(run.exitCode).toBe(0);
            expect(run.stderr).not.toContain("uncommitted");
        });
    });

    describe("when coach cannot be found", () => {
        it("should fail with a message that says coach could not be run, and exit 1", async () => {
            // Arrange
            const root = await createRepository(ALLOWED, policyPath);
            created.push(root);
            const withoutCoach = {
                ...ENVIRONMENT,
                // biome-ignore lint/style/useNamingConvention: environment variable name
                PATH: `${dirname(process.execPath)}${delimiter}/usr/bin${delimiter}/bin`,
            };

            // Act
            const run = await runEntryIn(root, withoutCoach);

            // Assert
            expect(run.exitCode).toBe(1);
            expect(run.stderr).toContain("architecture gate: FAILED");
            expect(run.stderr).toContain("could not run coach");
        });
    });

    describe("when coach cannot read the policy", () => {
        it("should fail rather than pass, and exit 1", async () => {
            // Arrange
            const brokenPolicy = join(compliant, "broken-policy.json");
            await writeFile(brokenPolicy, "{}");
            const root = await createRepository(ALLOWED, brokenPolicy);
            created.push(root);

            // Act
            const verdict = await runGateIn(root);
            const run = await runEntryIn(root);

            // Assert
            expect(verdict.passed).toBe(false);
            const text = verdict.messages.join("\n");
            expect(text).toContain("coach failed with exit code");
            expect(run.exitCode).toBe(1);
            expect(run.stderr).toContain("architecture gate: FAILED");
            expect(run.stderr).toContain("coach failed with exit code");
        });
    });
});
