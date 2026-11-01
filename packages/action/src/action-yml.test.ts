// biome-ignore-all lint/style/useNamingConvention: env var names use UPPER_SNAKE_CASE

import { execFile } from "node:child_process";
import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const actionYmlPath = resolve(__dirname, "..", "..", "..", "action.yml");

/** The workflow expression for the action's own path, substituted before running the script. */
const ACTION_PATH_EXPRESSION = "$" + "{{ github.action_path }}";

const ANNOTATION =
    "::warning title=instruction/discovery-limit-reached::stopped";

/** The bash script of the composite step that runs lint, as written in action.yml. */
async function readRunScript(actionPath: string): Promise<string> {
    const manifest = parseYaml(await readFile(actionYmlPath, "utf8")) as {
        runs: { steps: Array<{ name?: string; run?: string }> };
    };
    const step = manifest.runs.steps.find(
        (s) => s.name === "Run lousy-agents lint",
    );
    if (step?.run === undefined) {
        throw new Error("The lint step is missing from action.yml");
    }
    return step.run.replaceAll(ACTION_PATH_EXPRESSION, actionPath);
}

async function fakeBinary(
    dir: string,
    name: string,
    script: string,
): Promise<void> {
    const path = join(dir, name);
    await writeFile(path, `#!/usr/bin/env bash\n${script}\n`);
    await chmod(path, 0o755);
}

describe.skipIf(process.platform === "win32")(
    "the lint step in action.yml",
    () => {
        let temp: string;
        let bin: string;
        let runnerTemp: string;

        beforeEach(async () => {
            temp = await mkdtemp(join(tmpdir(), "action-yml-"));
            bin = join(temp, "bin");
            runnerTemp = join(temp, "runner-temp");
            await mkdir(bin);
            await mkdir(runnerTemp);
            const drainInput = "cat > /dev/null";
            await fakeBinary(bin, "reviewdog", drainInput);
        });

        afterEach(async () => {
            await rm(temp, { recursive: true, force: true });
        });

        async function runStep(): Promise<{ code: number; stdout: string }> {
            const script = await readRunScript(join(temp, "action"));
            const env = {
                ...process.env,
                PATH: `${bin}:${process.env.PATH ?? ""}`,
                RUNNER_TEMP: runnerTemp,
                INPUT_REPORTER: "github-pr-check",
                INPUT_FILTER_MODE: "added",
                INPUT_LEVEL: "info",
            };
            try {
                const { stdout } = await execFileAsync("bash", ["-c", script], {
                    env,
                });
                return { code: 0, stdout };
            } catch (error) {
                const e = error as { code?: number; stdout?: string };
                return { code: e.code ?? 1, stdout: e.stdout ?? "" };
            }
        }

        it("should replay the annotations on stdout even when lint writes its annotation file, prints rdjsonl, and exits non-zero under pipefail", async () => {
            await fakeBinary(
                bin,
                "node",
                `printf '%s\\n' '${ANNOTATION}' > "$LOUSY_AGENTS_ANNOTATIONS_FILE"\necho '{}'\nexit 1`,
            );

            const { code, stdout } = await runStep();

            expect(code).toBe(1);
            expect(stdout).toContain(ANNOTATION);
        });

        it("should replay the annotations when lint succeeds", async () => {
            await fakeBinary(
                bin,
                "node",
                `printf '%s\\n' '${ANNOTATION}' > "$LOUSY_AGENTS_ANNOTATIONS_FILE"\necho '{}'`,
            );

            const { code, stdout } = await runStep();

            expect(code).toBe(0);
            expect(stdout).toContain(ANNOTATION);
        });

        it("should print nothing and keep the exit status when lint writes no annotations", async () => {
            await fakeBinary(bin, "node", "echo '{}'");

            const { code, stdout } = await runStep();

            expect(code).toBe(0);
            expect(stdout).toBe("");
        });

        it("should not replay annotations left by an earlier run of the action in the same job", async () => {
            await writeFile(
                join(runnerTemp, "lousy-agents-annotations"),
                `${ANNOTATION}\n`,
            );
            await fakeBinary(bin, "node", "echo '{}'");

            const { stdout } = await runStep();

            expect(stdout).not.toContain(ANNOTATION);
        });
    },
);
