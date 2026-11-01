import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MAX_WALK_DEPTH } from "@lousy-agents/core/gateways/repository-walk.js";
import Chance from "chance";
import { createConsola } from "consola";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDoctorCommand } from "./run-doctor-command.js";

const chance = new Chance();
const __dirname = dirname(fileURLToPath(import.meta.url));
function fixture(name: string): string {
    return resolve(__dirname, "..", "..", "tests", "fixtures", name);
}

const SPRAWL_FIXTURE = "accidental-sprawl";
const SPRAWL_ARCHETYPE = "accidental-sprawl";
const WRONG_CASE_FORMAT = "JSON";
const sprawlPath = fixture(SPRAWL_FIXTURE);
const sprawlQuestion = "Multiple AI harnesses are configured";
const sprawlHint =
    "Answer 'yes' if you want multiple harnesses to work together. Answer 'no' if this is legacy configuration.";
const ACCEPTED_FORMATS_SENTENCE = "Accepted values: human, json.";
const FALLBACK_SENTENCE = "Falling back to human output.";
interface EnvironmentSettings {
    stdinIsTty: boolean;
    cwd?: string;
    answer?: boolean;
    injectConfirm?: boolean;
}

function buildEnvironment({
    stdinIsTty,
    cwd = sprawlPath,
    answer = false,
    injectConfirm = true,
}: EnvironmentSettings) {
    const logged: string[] = [];
    const warned: string[] = [];
    const errored: string[] = [];
    let stdout = "";
    const prompt = vi.fn().mockResolvedValue(answer);
    const logger = createConsola({
        level: 3,
        prompt,
        reporters: [
            {
                log: (entry) => {
                    const line = entry.args.join(" ");
                    logged.push(line);
                    if (entry.type === "warn") {
                        warned.push(line);
                    }
                    if (entry.type === "error") {
                        errored.push(line);
                    }
                },
            },
        ],
    });
    const confirm = vi.fn().mockResolvedValue(answer);
    const createLogger = vi.fn().mockReturnValue(logger);
    return {
        environment: {
            cwd,
            stdinIsTty,
            createLogger,
            writeStdout: (text: string) => {
                stdout += text;
            },
            ...(injectConfirm ? { confirm } : {}),
        },
        confirm,
        prompt,
        createLogger,
        logged,
        warned,
        errored,
        stdout: () => stdout,
    };
}

function unsupportedFormatWarning(described: string): string {
    return `Unsupported --format ${described}. ${ACCEPTED_FORMATS_SENTENCE} ${FALLBACK_SENTENCE}`;
}

describe("runDoctorCommand", () => {
    describe("when --format is not supported", () => {
        it("should warn with the full message, render human output, and exit 0", async () => {
            const unsupportedFormat = `jsno-${chance.word()}`;
            const env = buildEnvironment({ stdinIsTty: false });

            const exitCode = await runDoctorCommand(
                { format: unsupportedFormat, summary: false, ci: true },
                env.environment,
            );

            expect(exitCode).toBe(0);
            expect(env.warned).toEqual([
                unsupportedFormatWarning(`"${unsupportedFormat}"`),
            ]);
            expect(env.logged.join("\n")).toContain("Archetype:");
            expect(env.stdout()).toBe("");
            expect(env.createLogger).toHaveBeenCalledWith("human");
        });

        it("should not ask any question even on a terminal without --ci", async () => {
            const env = buildEnvironment({ stdinIsTty: true });

            await runDoctorCommand(
                { format: WRONG_CASE_FORMAT, summary: false, ci: false },
                env.environment,
            );

            expect(env.confirm).not.toHaveBeenCalled();
            expect(env.prompt).not.toHaveBeenCalled();
            expect(env.warned).toEqual([
                unsupportedFormatWarning(`"${WRONG_CASE_FORMAT}"`),
            ]);
        });
    });

    describe("when the format key is absent", () => {
        it("should render human output with no warning and exit 0", async () => {
            const env = buildEnvironment({ stdinIsTty: false });

            const exitCode = await runDoctorCommand(
                { summary: false, ci: true },
                env.environment,
            );

            expect(exitCode).toBe(0);
            expect(env.warned).toEqual([]);
            expect(env.errored).toEqual([]);
            expect(env.logged.join("\n")).toContain("Archetype:");
            expect(env.createLogger).toHaveBeenCalledWith("human");
        });
    });

    describe("when the working directory is relative", () => {
        it("should scan it as an absolute path", async () => {
            const relativeCwd = relative(process.cwd(), sprawlPath);
            const env = buildEnvironment({
                stdinIsTty: false,
                cwd: relativeCwd,
            });

            await runDoctorCommand(
                { format: "json", summary: false, ci: true },
                env.environment,
            );

            const report = JSON.parse(env.stdout());
            expect(isAbsolute(relativeCwd)).toBe(false);
            expect(report.intent.checkedPath).toBe(
                join(sprawlPath, ".agentic-doctor", "intent.json"),
            );
        });
    });

    describe("when the options are invalid", () => {
        it("should log the usage error at error level, write nothing to stdout, and exit 2", async () => {
            const env = buildEnvironment({ stdinIsTty: false });

            const exitCode = await runDoctorCommand(
                { format: "json", summary: chance.word(), ci: true },
                env.environment,
            );

            expect(exitCode).toBe(2);
            expect(env.stdout()).toBe("");
            expect(env.errored).toEqual([
                "Invalid doctor options: --summary must be a boolean.",
            ]);
        });

        it("should name both flags when both are invalid", async () => {
            const env = buildEnvironment({ stdinIsTty: false });

            const exitCode = await runDoctorCommand(
                { format: "human", summary: chance.word(), ci: chance.word() },
                env.environment,
            );

            expect(exitCode).toBe(2);
            expect(env.errored).toEqual([
                "Invalid doctor options: --summary and --ci must be booleans.",
            ]);
        });

        it("should say that the options must be an object when given null", async () => {
            const env = buildEnvironment({ stdinIsTty: false });

            const exitCode = await runDoctorCommand(null, env.environment);

            expect(exitCode).toBe(2);
            expect(env.errored).toEqual([
                "Invalid doctor options: options must be an object.",
            ]);
            expect(env.stdout()).toBe("");
        });
    });

    describe("when the output format is json", () => {
        it("should ask the environment for a json logger", async () => {
            const env = buildEnvironment({ stdinIsTty: false });

            await runDoctorCommand(
                { format: "json", summary: false, ci: true },
                env.environment,
            );

            expect(env.createLogger).toHaveBeenCalledWith("json");
            expect(env.createLogger).not.toHaveBeenCalledWith("human");
        });
    });

    describe("when the output format is human", () => {
        it("should ask the environment for a human logger", async () => {
            const env = buildEnvironment({ stdinIsTty: false });

            await runDoctorCommand(
                { format: "human", summary: false, ci: true },
                env.environment,
            );

            expect(env.createLogger).toHaveBeenCalledWith("human");
            expect(env.createLogger).not.toHaveBeenCalledWith("json");
        });
    });

    describe("when JSON is requested from a terminal without --ci", () => {
        it("should not prompt and should write exactly one JSON document", async () => {
            const env = buildEnvironment({ stdinIsTty: true });

            await runDoctorCommand(
                { format: "json", summary: false, ci: false },
                env.environment,
            );

            expect(env.confirm).not.toHaveBeenCalled();
            expect(env.logged).toEqual([]);
            expect(JSON.parse(env.stdout()).archetype).toBe(SPRAWL_ARCHETYPE);
        });
    });

    describe("when human output is requested from a terminal without --ci", () => {
        it("should ask each ambiguity question and show its hint", async () => {
            const env = buildEnvironment({ stdinIsTty: true });

            await runDoctorCommand(
                { format: "human", summary: false, ci: false },
                env.environment,
            );

            expect(env.confirm).toHaveBeenCalledTimes(1);
            expect(env.confirm).toHaveBeenCalledWith(
                expect.stringContaining(sprawlQuestion),
            );
            expect(env.logged).toContain(`\n${sprawlHint}`);
        });

        it("should acknowledge an affirmative answer", async () => {
            const env = buildEnvironment({ stdinIsTty: true, answer: true });

            await runDoctorCommand(
                { format: "human", summary: false, ci: false },
                env.environment,
            );

            expect(env.logged).toContain("  Noted.");
        });

        it("should not acknowledge a negative answer", async () => {
            const env = buildEnvironment({ stdinIsTty: true, answer: false });

            await runDoctorCommand(
                { format: "human", summary: false, ci: false },
                env.environment,
            );

            expect(env.logged).not.toContain("  Noted.");
        });

        it("should ask through a confirm prompt that defaults to no when no confirm port is injected", async () => {
            const env = buildEnvironment({
                stdinIsTty: true,
                injectConfirm: false,
            });

            await runDoctorCommand(
                { format: "human", summary: false, ci: false },
                env.environment,
            );

            expect(env.prompt).toHaveBeenCalledTimes(1);
            expect(env.prompt).toHaveBeenCalledWith(
                expect.stringContaining(sprawlQuestion),
                { type: "confirm", initial: false },
            );
        });
    });

    describe("when human output is requested without a terminal", () => {
        it("should not ask any question", async () => {
            const env = buildEnvironment({ stdinIsTty: false });

            await runDoctorCommand(
                { format: "human", summary: false, ci: false },
                env.environment,
            );

            expect(env.confirm).not.toHaveBeenCalled();
        });
    });

    describe("when a step after the scan fails", () => {
        const failure = new Error(chance.sentence());

        describe("when the scan was cut short by the depth limit", () => {
            let cutShortRoot: string;

            beforeEach(async () => {
                cutShortRoot = await mkdtemp(
                    join(tmpdir(), "doctor-cut-short-"),
                );
                await cp(sprawlPath, cutShortRoot, { recursive: true });
                const tooDeep = join(
                    cutShortRoot,
                    ...Array.from(
                        { length: DEFAULT_MAX_WALK_DEPTH + 2 },
                        (_, level) => `d${level}`,
                    ),
                );
                await mkdir(tooDeep, { recursive: true });
                await writeFile(join(tooDeep, "notes.md"), "# notes\n");
            });

            afterEach(async () => {
                await rm(cutShortRoot, { recursive: true, force: true });
            });

            it("should warn that the scan was cut short before it rejects with the original error", async () => {
                const env = buildEnvironment({
                    stdinIsTty: true,
                    cwd: cutShortRoot,
                });
                env.confirm.mockRejectedValue(failure);

                await expect(
                    runDoctorCommand(
                        { format: "human", summary: false, ci: false },
                        env.environment,
                    ),
                ).rejects.toBe(failure);

                expect(env.warned).toEqual([
                    `The repository scan did not go more than ${DEFAULT_MAX_WALK_DEPTH} directories deep, so agentic constructs in deeper directories are not in this report.`,
                ]);
            });

            it("should have asked the question that failed, so the failure came after the scan", async () => {
                const env = buildEnvironment({
                    stdinIsTty: true,
                    cwd: cutShortRoot,
                });
                env.confirm.mockRejectedValue(failure);

                await runDoctorCommand(
                    { format: "human", summary: false, ci: false },
                    env.environment,
                ).catch(() => undefined);

                expect(env.confirm).toHaveBeenCalledTimes(1);
            });
        });

        describe("when the scan covered the whole repository", () => {
            it("should reject with the original error and warn about nothing", async () => {
                const env = buildEnvironment({ stdinIsTty: true });
                env.confirm.mockRejectedValue(failure);

                await expect(
                    runDoctorCommand(
                        { format: "human", summary: false, ci: false },
                        env.environment,
                    ),
                ).rejects.toBe(failure);

                expect(env.warned).toEqual([]);
            });
        });
    });

    describe("when the scan itself fails", () => {
        it("should reject with the filesystem error and warn about nothing", async () => {
            const env = buildEnvironment({
                stdinIsTty: false,
                cwd: join(sprawlPath, `missing-${chance.guid()}`),
            });

            await expect(
                runDoctorCommand(
                    { format: "human", summary: false, ci: true },
                    env.environment,
                ),
            ).rejects.toMatchObject({ code: "ENOENT" });

            expect(env.warned).toEqual([]);
        });
    });

    describe("when --ci is set on a terminal", () => {
        it("should not ask any question", async () => {
            const env = buildEnvironment({ stdinIsTty: true });

            await runDoctorCommand(
                { format: "human", summary: false, ci: true },
                env.environment,
            );

            expect(env.confirm).not.toHaveBeenCalled();
        });
    });

    for (const format of ["human", "json"] as const) {
        describe(`when a ${format} evaluation finds a critical defect`, () => {
            it("should return exit code 1", async () => {
                const env = buildEnvironment({
                    stdinIsTty: false,
                    cwd: fixture("integration-scenario"),
                });

                const exitCode = await runDoctorCommand(
                    { format, summary: false, ci: true },
                    env.environment,
                );

                expect(exitCode).toBe(1);
            });
        });

        describe(`when a ${format} evaluation finds only advisories and medium defects`, () => {
            it("should return exit code 0", async () => {
                const env = buildEnvironment({ stdinIsTty: false });

                const exitCode = await runDoctorCommand(
                    { format, summary: false, ci: true },
                    env.environment,
                );

                expect(exitCode).toBe(0);
            });
        });
    }
});
