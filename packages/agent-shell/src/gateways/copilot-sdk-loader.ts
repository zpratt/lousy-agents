import type {
    CopilotClientHandle,
    CopilotSdk,
    LoadCopilotSdk,
} from "../use-cases/copilot-enhance.js";
import { resolveSdkPath as resolveInstalledSdkPath } from "./resolve-sdk.js";

const SDK_PACKAGE = "@github/copilot-sdk";

export interface CopilotSdkLoaderDeps {
    /** Finds the project's own copy of a package; defaults to the project-anchored resolver */
    readonly resolveSdkPath?: (
        repoRoot: string,
        packageName: string,
    ) => string | null;
}

/**
 * Imports the SDK from the project's own copy when there is one. The bare
 * package name is the fallback, kept as a literal so the bundler leaves it as
 * an external import.
 */
async function importSdkModule(sdkPath: string | null): Promise<unknown> {
    return sdkPath
        ? await import(/* webpackIgnore: true */ sdkPath)
        : await import("@github/copilot-sdk");
}

const CLIENT_METHODS = ["start", "stop", "createSession"] as const;

/**
 * Whether an object a constructor built has the methods the analysis calls on a
 * client. A constructor always yields an object, so nothing else needs checking.
 */
function isClientHandle(value: object): value is CopilotClientHandle {
    return CLIENT_METHODS.every(
        (method) => typeof Reflect.get(value, method) === "function",
    );
}

function exportOf(sdkModule: unknown, name: string): unknown {
    return typeof sdkModule === "object" && sdkModule !== null
        ? Reflect.get(sdkModule, name)
        : undefined;
}

/**
 * Wraps the SDK module in the shape the use case expects. A module that lacks
 * an export fails when that export is first used, not when it is loaded.
 */
function describeSdk(sdkModule: unknown): CopilotSdk {
    const clientClass = exportOf(sdkModule, "CopilotClient");
    const defineTool = exportOf(sdkModule, "defineTool");
    return {
        createClient: () => {
            if (typeof clientClass !== "function") {
                throw new TypeError(
                    `${SDK_PACKAGE} does not export a CopilotClient class`,
                );
            }
            const client: object = Reflect.construct(clientClass, []);
            if (!isClientHandle(client)) {
                throw new TypeError(
                    `${SDK_PACKAGE}'s CopilotClient did not produce a client with start, stop and createSession`,
                );
            }
            return client;
        },
        defineTool: (name, config) => {
            if (typeof defineTool !== "function") {
                throw new TypeError(
                    `${SDK_PACKAGE} does not export a defineTool function`,
                );
            }
            return defineTool(name, config);
        },
        approveAll: exportOf(sdkModule, "approveAll"),
    };
}

/**
 * Creates the function the use case calls to load @github/copilot-sdk, an
 * optional peer dependency that may not be installed.
 */
export function createCopilotSdkLoader(
    deps: CopilotSdkLoaderDeps = {},
): LoadCopilotSdk {
    const resolveSdkPath = deps.resolveSdkPath ?? resolveInstalledSdkPath;
    return async (repoRoot) =>
        describeSdk(
            await importSdkModule(resolveSdkPath(repoRoot, SDK_PACKAGE)),
        );
}
