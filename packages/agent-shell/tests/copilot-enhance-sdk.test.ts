import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectScanResult } from "../src/entities/project-scan.js";
import { createCopilotSdkLoader } from "../src/gateways/copilot-sdk-loader.js";
import { readBytesWithinRoot, statWithinRoot } from "../src/lib/safe-fs.js";
import {
    type CopilotEnhancePort,
    enhanceWithCopilot,
} from "../src/use-cases/copilot-enhance.js";

const chance = new Chance();

const SDK_PACKAGE = "@github/copilot-sdk";
const DEBUG_ENVIRONMENT_VARIABLE = "AGENT_SHELL_COPILOT_DEBUG";

const EMPTY_SCAN: ProjectScanResult = {
    scripts: [],
    workflowCommands: [],
    miseTasks: [],
    languages: [],
};

const RULE = "npm test";

// A stand-in for the Copilot SDK. It writes what the use case does to it into
// events.log beside the module, and answers with a reply that echoes the model,
// the tools and the MCP servers it was given.
const WORKING_SDK = `
import { appendFileSync } from "node:fs";
const log = (event) => appendFileSync(new URL("./events.log", import.meta.url), event + "\\n");
export const approveAll = () => "approved";
export const defineTool = (name, config) => ({ name, ...config });
export class CopilotClient {
    async start() { log("start"); }
    async stop() { log("stop"); }
    async createSession(options) {
        log("createSession");
        return {
            async sendAndWait() {
                log("sendAndWait");
                return { data: { content: "Here you go: " + JSON.stringify({
                    additionalAllowRules: ["${RULE}"],
                    suggestions: [
                        "model:" + options.model,
                        "tools:" + options.tools.map((tool) => tool.name).join(","),
                        "mcp:" + Object.keys(options.mcpServers).join(","),
                        "approve:" + options.onPermissionRequest(),
                    ],
                }) } };
            },
            async disconnect() { log("disconnect"); },
        };
    }
}
`;

const FAILING_SDK = WORKING_SDK.replace(
    'log("sendAndWait");',
    'log("sendAndWait"); throw new Error("session exploded");',
);

const UNPARSEABLE_SDK = WORKING_SDK.replace(
    /return \{ data: \{ content: "Here you go: " \+ JSON\.stringify\(\{[\s\S]*?\}\) \} \};/,
    'return { data: { content: "no json here" } };',
);

describe("enhanceWithCopilot loading the Copilot SDK", () => {
    let workDir: string;
    let stderr: string[];

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), "copilot-enhance-sdk-"));
        stderr = [];
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await rm(workDir, { recursive: true, force: true });
    });

    async function installSdk(source: string): Promise<string> {
        const sdkFile = join(workDir, `sdk-${chance.hash({ length: 8 })}.mjs`);
        await writeFile(sdkFile, source);
        return pathToFileURL(sdkFile).href;
    }

    function portFinding(
        sdkUrl: string | null,
        resolveSdkPath: (
            repoRoot: string,
            packageName: string,
        ) => string | null = () => sdkUrl,
    ): CopilotEnhancePort {
        return {
            loadSdk: createCopilotSdkLoader({ resolveSdkPath }),
            statWithinRoot,
            readBytesWithinRoot,
        };
    }

    async function events(): Promise<string[]> {
        const log = await readFile(join(workDir, "events.log"), "utf8");
        return log.split("\n").filter((line) => line !== "");
    }

    function enhance(port: CopilotEnhancePort, model?: string) {
        return enhanceWithCopilot(
            EMPTY_SCAN,
            workDir,
            (data) => stderr.push(data),
            port,
            model,
        );
    }

    describe("given the project's own copy of the SDK is found", () => {
        it("should ask for the SDK package starting from the repository root", async () => {
            // Arrange
            const requests: Array<[string, string]> = [];
            const sdkUrl = await installSdk(WORKING_SDK);
            const port = portFinding(sdkUrl, (repoRoot, packageName) => {
                requests.push([repoRoot, packageName]);
                return sdkUrl;
            });

            // Act
            await enhance(port);

            // Assert
            expect(requests).toEqual([[workDir, SDK_PACKAGE]]);
        });

        it("should run the analysis through that copy and return what it answers", async () => {
            // Arrange
            const model = `model-${chance.word()}`;
            const port = portFinding(await installSdk(WORKING_SDK));

            // Act
            const result = await enhance(port, model);

            // Assert
            expect(result).toEqual({
                additionalAllowRules: [RULE],
                suggestions: [
                    `model:${model}`,
                    "tools:read_project_file,validate_allow_rule",
                    "mcp:lousy-agents",
                    "approve:approved",
                ],
            });
        });

        it("should start the client, send the prompt, then disconnect and stop in that order", async () => {
            // Arrange
            const port = portFinding(await installSdk(WORKING_SDK));

            // Act
            await enhance(port);

            // Assert
            expect(await events()).toEqual([
                "start",
                "createSession",
                "sendAndWait",
                "disconnect",
                "stop",
            ]);
        });

        it("should stay silent about a successful analysis even in debug mode", async () => {
            // Arrange
            vi.stubEnv(DEBUG_ENVIRONMENT_VARIABLE, "1");
            const port = portFinding(await installSdk(WORKING_SDK));

            // Act
            await enhance(port);

            // Assert
            expect(stderr).toEqual([]);
        });

        it("should return null when the SDK's reply holds no analysis", async () => {
            // Arrange
            const port = portFinding(await installSdk(UNPARSEABLE_SDK));

            // Act
            const result = await enhance(port);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe("given the SDK's session fails", () => {
        it("should return null and still disconnect and stop", async () => {
            // Arrange
            const port = portFinding(await installSdk(FAILING_SDK));

            // Act
            const result = await enhance(port);

            // Assert
            expect(result).toBeNull();
            expect(await events()).toEqual([
                "start",
                "createSession",
                "sendAndWait",
                "disconnect",
                "stop",
            ]);
        });

        it("should say the analysis failed, and why, only in debug mode", async () => {
            // Arrange
            const port = portFinding(await installSdk(FAILING_SDK));

            // Act
            await enhance(port);
            vi.stubEnv(DEBUG_ENVIRONMENT_VARIABLE, "1");
            await enhance(port);

            // Assert
            expect(stderr).toEqual([
                "agent-shell: Copilot analysis failed — session exploded\n",
            ]);
        });
    });

    describe("given the SDK cannot be loaded", () => {
        it("should return null when the module it was pointed at does not exist", async () => {
            // Arrange
            const missing = pathToFileURL(join(workDir, "absent-sdk.mjs")).href;
            const port = portFinding(missing);

            // Act
            const result = await enhance(port);

            // Assert
            expect(result).toBeNull();
        });

        it("should return null when no copy is found and the package is not installed", async () => {
            // Arrange
            const port = portFinding(null);

            // Act
            const result = await enhance(port);

            // Assert
            expect(result).toBeNull();
        });

        it("should say the SDK is unavailable, and fall back to static analysis, only in debug mode", async () => {
            // Arrange
            const port = portFinding(null);

            // Act
            await enhance(port);
            vi.stubEnv(DEBUG_ENVIRONMENT_VARIABLE, "1");
            await enhance(port);

            // Assert
            expect(stderr).toEqual([
                "agent-shell: Copilot SDK not available — using static analysis only\n",
            ]);
        });
    });
});
