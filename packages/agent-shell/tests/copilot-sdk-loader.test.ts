import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCopilotSdkLoader } from "../src/gateways/copilot-sdk-loader.js";

const chance = new Chance();

const SDK_PACKAGE = "@github/copilot-sdk";

const WORKING_SDK = `
export const approveAll = "approve-all-marker";
export const defineTool = (name, config) => ({ defined: name, config });
export class CopilotClient {
    constructor(...args) { this.kind = "client"; this.argumentCount = args.length; }
    async start() { return "started"; }
    async stop() { return "stopped"; }
    async createSession() { return { created: true }; }
}
`;

const WITHOUT_CLIENT = `
export const approveAll = "approve-all-marker";
export const defineTool = (name, config) => ({ defined: name, config });
`;

const WITHOUT_DEFINE_TOOL = `
export const approveAll = "approve-all-marker";
export class CopilotClient {
    async start() {}
    async stop() {}
    async createSession() {}
}
`;

const CLIENT_BODY = `
    async start() {}
    async stop() {}
    async createSession() {}
`;

/** A client class whose instance has `member` as a plain value, not a method. */
function clientWithNonFunction(member: string): string {
    const methods = ["start", "stop", "createSession"]
        .filter((name) => name !== member)
        .map((name) => `    async ${name}() {}`)
        .join("\n");
    return `export class CopilotClient {\n    constructor() { this.${member} = "not a function"; }\n${methods}\n}\n`;
}

function clientMissing(method: string): string {
    const methods = ["start", "stop", "createSession"].filter(
        (name) => name !== method,
    );
    return `export class CopilotClient {\n${methods
        .map((name) => `    async ${name}() {}`)
        .join("\n")}\n}\n`;
}

const TOOL_CONFIG = {
    description: "a tool",
    parameters: {},
    handler: async () => "ok",
};

describe("createCopilotSdkLoader", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), "copilot-sdk-loader-"));
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    async function installSdk(source: string): Promise<string> {
        const sdkFile = join(workDir, `sdk-${chance.hash({ length: 8 })}.mjs`);
        await writeFile(sdkFile, source);
        return pathToFileURL(sdkFile).href;
    }

    describe("given the project's own copy of the SDK is found", () => {
        it("should ask where the SDK package lives starting from the repository root", async () => {
            // Arrange
            const requests: Array<[string, string]> = [];
            const sdkUrl = await installSdk(WORKING_SDK);
            const load = createCopilotSdkLoader({
                resolveSdkPath: (repoRoot, packageName) => {
                    requests.push([repoRoot, packageName]);
                    return sdkUrl;
                },
            });

            // Act
            await load(workDir);

            // Assert
            expect(requests).toEqual([[workDir, SDK_PACKAGE]]);
        });

        it("should create clients from the SDK's client class", async () => {
            // Arrange
            const sdkUrl = await installSdk(WORKING_SDK);
            const load = createCopilotSdkLoader({
                resolveSdkPath: () => sdkUrl,
            });

            // Act
            const sdk = await load(workDir);
            const client = sdk.createClient();

            // Assert
            expect(await client.start()).toBe("started");
            expect(Reflect.get(client, "kind")).toBe("client");
            expect(Reflect.get(client, "argumentCount")).toBe(0);
        });

        it("should define tools with the SDK's own function and expose its approve-all handler", async () => {
            // Arrange
            const sdkUrl = await installSdk(WORKING_SDK);
            const load = createCopilotSdkLoader({
                resolveSdkPath: () => sdkUrl,
            });
            const toolName = chance.word();
            const config = {
                description: chance.sentence(),
                parameters: {},
                handler: async () => "ok",
            };

            // Act
            const sdk = await load(workDir);
            const tool = sdk.defineTool(toolName, config);

            // Assert
            expect(tool).toEqual({ defined: toolName, config });
            expect(sdk.approveAll).toBe("approve-all-marker");
        });
    });

    describe("given the SDK cannot be loaded", () => {
        it("should reject when the module it was pointed at does not exist", async () => {
            // Arrange
            const missing = pathToFileURL(join(workDir, "absent-sdk.mjs")).href;
            const load = createCopilotSdkLoader({
                resolveSdkPath: () => missing,
            });

            // Act
            const loading = load(workDir);

            // Assert
            await expect(loading).rejects.toThrow();
        });

        it("should reject when no copy is found and the package is not installed", async () => {
            // Arrange
            const load = createCopilotSdkLoader({
                resolveSdkPath: () => null,
            });

            // Act
            const loading = load(workDir);

            // Assert
            await expect(loading).rejects.toThrow();
        });
    });

    describe("given the module lacks one of the exports the analysis uses", () => {
        it("should still define tools when only the client class is missing, and fail only when a client is created", async () => {
            // Arrange
            const sdkUrl = await installSdk(WITHOUT_CLIENT);
            const load = createCopilotSdkLoader({
                resolveSdkPath: () => sdkUrl,
            });

            // Act
            const sdk = await load(workDir);

            // Assert
            expect(() => sdk.createClient()).toThrow(
                new TypeError(
                    `${SDK_PACKAGE} does not export a CopilotClient class`,
                ),
            );
            expect(sdk.defineTool("t", TOOL_CONFIG)).toEqual({
                defined: "t",
                config: TOOL_CONFIG,
            });
        });

        it("should still create clients when only defineTool is missing, and fail only when a tool is defined", async () => {
            // Arrange
            const sdkUrl = await installSdk(WITHOUT_DEFINE_TOOL);
            const load = createCopilotSdkLoader({
                resolveSdkPath: () => sdkUrl,
            });

            // Act
            const sdk = await load(workDir);

            // Assert
            expect(() => sdk.defineTool("t", TOOL_CONFIG)).toThrow(
                new TypeError(
                    `${SDK_PACKAGE} does not export a defineTool function`,
                ),
            );
            expect(typeof sdk.createClient().start).toBe("function");
        });
    });

    describe("given an export that is present but is not a function", () => {
        it("should refuse a CopilotClient that is not a class", async () => {
            // Arrange
            const sdkUrl = await installSdk(
                'export const CopilotClient = "not a class";\nexport const defineTool = () => ({});\n',
            );
            const load = createCopilotSdkLoader({
                resolveSdkPath: () => sdkUrl,
            });

            // Act
            const sdk = await load(workDir);

            // Assert
            expect(() => sdk.createClient()).toThrow(
                new TypeError(
                    `${SDK_PACKAGE} does not export a CopilotClient class`,
                ),
            );
        });

        it("should refuse a defineTool that is not a function", async () => {
            // Arrange
            const sdkUrl = await installSdk(
                `export class CopilotClient {${CLIENT_BODY}}\nexport const defineTool = { not: "a function" };\n`,
            );
            const load = createCopilotSdkLoader({
                resolveSdkPath: () => sdkUrl,
            });

            // Act
            const sdk = await load(workDir);

            // Assert
            expect(() => sdk.defineTool("t", TOOL_CONFIG)).toThrow(
                new TypeError(
                    `${SDK_PACKAGE} does not export a defineTool function`,
                ),
            );
        });

        it.each(["start", "stop", "createSession"])(
            "should refuse a client whose %s is a value, not a method",
            async (member) => {
                // Arrange
                const sdkUrl = await installSdk(clientWithNonFunction(member));
                const load = createCopilotSdkLoader({
                    resolveSdkPath: () => sdkUrl,
                });

                // Act
                const sdk = await load(workDir);

                // Assert
                expect(() => sdk.createClient()).toThrow(
                    new TypeError(
                        `${SDK_PACKAGE}'s CopilotClient did not produce a client with start, stop and createSession`,
                    ),
                );
            },
        );
    });

    describe("given the client class builds something that is not a client", () => {
        it.each(["start", "stop", "createSession"])(
            "should refuse an instance with no %s method rather than hand it to the analysis",
            async (missing) => {
                // Arrange
                const sdkUrl = await installSdk(clientMissing(missing));
                const load = createCopilotSdkLoader({
                    resolveSdkPath: () => sdkUrl,
                });

                // Act
                const sdk = await load(workDir);

                // Assert
                expect(() => sdk.createClient()).toThrow(
                    new TypeError(
                        `${SDK_PACKAGE}'s CopilotClient did not produce a client with start, stop and createSession`,
                    ),
                );
            },
        );
    });

    describe("given the module does not export what the SDK should", () => {
        it("should load, then fail when a client is created or a tool is defined", async () => {
            // Arrange
            const sdkUrl = await installSdk("export const unrelated = 1;\n");
            const load = createCopilotSdkLoader({
                resolveSdkPath: () => sdkUrl,
            });

            // Act
            const sdk = await load(workDir);

            // Assert
            expect(() => sdk.createClient()).toThrow(TypeError);
            expect(() =>
                sdk.defineTool(chance.word(), {
                    description: chance.sentence(),
                    parameters: {},
                    handler: async () => "ok",
                }),
            ).toThrow(TypeError);
        });
    });
});
