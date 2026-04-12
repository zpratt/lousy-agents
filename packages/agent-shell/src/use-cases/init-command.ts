import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import type { HooksConfig } from "../entities/types.js";
import { HooksConfigSchema, PolicyConfigSchema } from "../entities/types.js";
import type { ProjectScanResult } from "../gateways/project-scanner.js";
import { isPathNotFoundError, isWithinProjectRoot } from "../lib/path-utils.js";
import { sanitizeForStderr } from "../lib/sanitize.js";
import { generatePolicy } from "./policy-init.js";

const HOOKS_SUBPATH = ".github/hooks/agent-shell/hooks.json";
const POLICY_SUBPATH = ".github/hooks/agent-shell/policy.json";
const HOOKS_PARENT = ".github/hooks/agent-shell";

export interface InitDeps {
    getRepositoryRoot: () => string;
    writeStdout: (data: string) => void;
    writeStderr: (data: string) => void;
    readFile: (path: string, encoding: "utf-8") => Promise<string>;
    writeFile: (
        path: string,
        content: string,
        options?: { flag?: string },
    ) => Promise<void>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
    unlink: (path: string) => Promise<void>;
    mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>;
    realpath: (path: string) => Promise<string>;
    scanProject: (dir: string) => Promise<ProjectScanResult>;
    isTty: boolean;
    prompt?: (message: string) => Promise<boolean>;
}

export interface InitFlags {
    flightRecorder: boolean;
    policy: boolean;
    noFlightRecorder: boolean;
    noPolicy: boolean;
}

interface DetectedFeatures {
    hasPreToolUse: boolean;
    hasPostToolUse: boolean;
}

const AGENT_SHELL_POLICY_CHECK = "agent-shell policy-check";
const AGENT_SHELL_RECORD = "agent-shell record";
const AGENT_SHELL_ALLOW_ENTRIES = [
    AGENT_SHELL_POLICY_CHECK,
    AGENT_SHELL_RECORD,
];

function hasHookCommand(
    hooks: HooksConfig["hooks"]["preToolUse"],
    expectedCommand: string,
): boolean {
    if (!Array.isArray(hooks)) {
        return false;
    }
    return hooks.some((hook) => {
        if (typeof hook !== "object" || hook === null) {
            return false;
        }
        const bashMatch =
            "bash" in hook &&
            typeof hook.bash === "string" &&
            hook.bash === expectedCommand;
        const powershellMatch =
            "powershell" in hook &&
            typeof hook.powershell === "string" &&
            hook.powershell === expectedCommand;
        return bashMatch || powershellMatch;
    });
}

export type PolicyPatchResult =
    | { status: "patched"; content: string }
    | { status: "unchanged" }
    | { status: "invalid"; reason: string };

/**
 * Ensures agent-shell's own commands are in an existing policy.json allow list.
 * Returns a discriminated union:
 * - `patched` with new content when entries were added
 * - `unchanged` when all entries are already present
 * - `invalid` when the file cannot be parsed or fails schema validation
 */
export function ensureAgentShellAllowed(content: string): PolicyPatchResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return { status: "invalid", reason: "JSON parse error" };
    }

    const result = PolicyConfigSchema.safeParse(parsed);
    if (!result.success) {
        return { status: "invalid", reason: "policy schema validation failed" };
    }

    const policy = result.data;
    const allow = policy.allow ? [...policy.allow] : [];

    const missing = AGENT_SHELL_ALLOW_ENTRIES.filter(
        (entry) => !allow.includes(entry),
    );

    if (missing.length === 0) {
        return { status: "unchanged" };
    }

    allow.push(...missing);
    const patched = { ...policy, allow };
    return {
        status: "patched",
        content: `${JSON.stringify(patched, null, 2)}\n`,
    };
}

function detectExistingFeatures(config: HooksConfig): DetectedFeatures {
    return {
        hasPreToolUse: hasHookCommand(
            config.hooks.preToolUse,
            AGENT_SHELL_POLICY_CHECK,
        ),
        hasPostToolUse: hasHookCommand(
            config.hooks.postToolUse,
            AGENT_SHELL_RECORD,
        ),
    };
}

async function loadExistingHooksConfig(
    hooksPath: string,
    deps: Pick<InitDeps, "readFile" | "writeStderr">,
): Promise<{ config: HooksConfig | null; error: boolean }> {
    try {
        const raw = await deps.readFile(hooksPath, "utf-8");
        const parsed: unknown = JSON.parse(raw);
        return { config: HooksConfigSchema.parse(parsed), error: false };
    } catch (err) {
        if (isPathNotFoundError(err)) {
            return { config: null, error: false };
        }
        deps.writeStderr(
            `agent-shell: failed to read existing hooks.json: ${sanitizeForStderr(err)}\n`,
        );
        return { config: null, error: true };
    }
}

function hasExplicitFlags(flags: InitFlags): boolean {
    return (
        flags.flightRecorder ||
        flags.policy ||
        flags.noFlightRecorder ||
        flags.noPolicy
    );
}

/**
 * Resolves feature selections in explicit-flag mode.
 * Only features with an explicit --flag are enabled; unspecified features
 * are not added (existing hooks are preserved via config merge).
 */
function resolveExplicitFlagSelections(flags: InitFlags): {
    enableFlightRecorder: boolean;
    enablePolicy: boolean;
} {
    let enableFlightRecorder: boolean;
    let enablePolicy: boolean;

    if (flags.noFlightRecorder) {
        enableFlightRecorder = false;
    } else {
        enableFlightRecorder = flags.flightRecorder;
    }

    if (flags.noPolicy) {
        enablePolicy = false;
    } else {
        enablePolicy = flags.policy;
    }

    return { enableFlightRecorder, enablePolicy };
}

async function validatePathContainment(
    subpath: string,
    repoRoot: string,
    deps: Pick<InitDeps, "realpath" | "writeStderr">,
): Promise<boolean> {
    const resolvedPath = resolve(repoRoot, subpath);
    if (!isWithinProjectRoot(resolvedPath, repoRoot)) {
        deps.writeStderr(
            `agent-shell: path ${subpath} resolves outside repository root, aborting\n`,
        );
        return false;
    }

    // Canonicalize repoRoot first — if this fails, the containment check
    // is impossible and we must abort.
    let realRepoRoot: string;
    try {
        realRepoRoot = await deps.realpath(repoRoot);
    } catch (err) {
        if (!isPathNotFoundError(err)) {
            throw err;
        }
        deps.writeStderr(
            `agent-shell: repository root ${sanitizeForStderr(repoRoot)} is unreachable or cannot be canonicalized, aborting\n`,
        );
        return false;
    }

    try {
        const realPath = await deps.realpath(resolvedPath);
        if (!isWithinProjectRoot(realPath, realRepoRoot)) {
            deps.writeStderr(
                `agent-shell: path ${subpath} resolves outside repository root via symlink, aborting\n`,
            );
            return false;
        }
    } catch (err) {
        if (!isPathNotFoundError(err)) {
            throw err;
        }
        // Target path doesn't exist yet, which is fine for new config files
    }

    return true;
}

async function writeConfigFile(
    repoRoot: string,
    subpath: string,
    content: string,
    deps: Pick<
        InitDeps,
        | "writeFile"
        | "rename"
        | "unlink"
        | "mkdir"
        | "realpath"
        | "writeStdout"
        | "writeStderr"
    >,
): Promise<boolean> {
    const valid = await validatePathContainment(subpath, repoRoot, deps);
    if (!valid) {
        return false;
    }

    const filePath = join(repoRoot, subpath);
    const parentDir = join(repoRoot, HOOKS_PARENT);
    await deps.mkdir(parentDir, { recursive: true });

    // Post-mkdir containment recheck: verify the parent directory hasn't
    // been redirected via symlink created between the pre-check and mkdir.
    let realRepoRoot: string;
    try {
        realRepoRoot = await deps.realpath(repoRoot);
    } catch (err) {
        if (!isPathNotFoundError(err)) {
            throw err;
        }
        deps.writeStderr(
            `agent-shell: repository root ${sanitizeForStderr(repoRoot)} is unreachable or cannot be canonicalized, aborting\n`,
        );
        return false;
    }

    try {
        const realParent = await deps.realpath(parentDir);
        if (!isWithinProjectRoot(realParent, realRepoRoot)) {
            deps.writeStderr(
                `agent-shell: parent directory resolves outside repository root after mkdir, aborting\n`,
            );
            return false;
        }
    } catch (err) {
        if (!isPathNotFoundError(err)) {
            throw err;
        }
    }

    // Atomic write: write to a temp file in the same directory, then rename.
    // rename() replaces the destination directory entry atomically — if the
    // target path is (or becomes) a symlink, rename replaces the symlink
    // itself rather than following it, closing the TOCTOU window between
    // validation and write.
    // Uses crypto.randomBytes for an unpredictable suffix and exclusive-create
    // flag ('wx' = O_CREAT | O_WRONLY | O_EXCL) so writeFile fails if a
    // symlink or file already exists at the temp path.
    const tmpSuffix = randomBytes(8).toString("hex");
    const tmpPath = `${filePath}.${tmpSuffix}.tmp`;
    try {
        await deps.writeFile(tmpPath, content, { flag: "wx" });
        await deps.rename(tmpPath, filePath);
    } catch (err) {
        // Best-effort cleanup of orphaned temp file on rename failure
        try {
            await deps.unlink(tmpPath);
        } catch {
            // Ignore cleanup errors — the temp file may not exist if
            // writeFile failed, or the directory may be read-only.
        }
        throw err;
    }
    deps.writeStdout(`Wrote ${subpath}\n`);
    return true;
}

export async function handleInit(
    flags: InitFlags,
    deps: InitDeps,
): Promise<boolean> {
    const repoRoot = deps.getRepositoryRoot();
    const hooksPath = join(repoRoot, HOOKS_SUBPATH);

    const { config: existingConfig, error: loadError } =
        await loadExistingHooksConfig(hooksPath, deps);

    if (loadError) {
        return false;
    }

    const existing: DetectedFeatures = existingConfig
        ? detectExistingFeatures(existingConfig)
        : { hasPreToolUse: false, hasPostToolUse: false };

    if (existing.hasPreToolUse && existing.hasPostToolUse) {
        deps.writeStdout("All features already configured in hooks.json\n");
        return true;
    }

    let enableFlightRecorder: boolean;
    let enablePolicy: boolean;

    if (hasExplicitFlags(flags)) {
        // Non-interactive: apply explicit flags only — don't add unspecified features
        const selections = resolveExplicitFlagSelections(flags);
        enableFlightRecorder =
            selections.enableFlightRecorder && !existing.hasPostToolUse;
        enablePolicy = selections.enablePolicy && !existing.hasPreToolUse;

        // If the user requested features but they're all already configured, report no-op
        if (
            !enableFlightRecorder &&
            !enablePolicy &&
            (selections.enableFlightRecorder || selections.enablePolicy)
        ) {
            deps.writeStdout(
                "Requested features already configured in hooks.json; nothing to do\n",
            );
            return true;
        }
    } else if (!deps.isTty && deps.prompt === undefined) {
        // Non-TTY with no explicit flags: default to enabling all missing features
        const missing: string[] = [];
        enableFlightRecorder = !existing.hasPostToolUse;
        enablePolicy = !existing.hasPreToolUse;

        if (enableFlightRecorder) missing.push("flight recording");
        if (enablePolicy) missing.push("policy blocking");

        if (missing.length > 0) {
            deps.writeStderr(
                `agent-shell: non-interactive mode, auto-enabling: ${missing.join(", ")}\n`,
            );
        }
    } else if (deps.prompt) {
        // Interactive: prompt for each missing feature
        enableFlightRecorder = false;
        enablePolicy = false;

        if (!existing.hasPostToolUse) {
            enableFlightRecorder = await deps.prompt(
                "Enable flight recording to capture all agent tool usage?",
            );
        }

        if (!existing.hasPreToolUse) {
            enablePolicy = await deps.prompt(
                "Enable policy-based command blocking?",
            );
        }
    } else {
        // Fallback: enable all missing features
        enableFlightRecorder = !existing.hasPostToolUse;
        enablePolicy = !existing.hasPreToolUse;
    }

    if (!enableFlightRecorder && !enablePolicy) {
        deps.writeStdout("No features selected, nothing to do.\n");
        return true;
    }

    // Build the hooks config by merging agent-shell hooks into existing config,
    // preserving any other hooks (sessionStart, sessionEnd, userPromptSubmitted, etc.)
    const mergedConfig: HooksConfig = existingConfig
        ? structuredClone(existingConfig)
        : { version: 1, hooks: {} };

    if (enablePolicy && !existing.hasPreToolUse) {
        const policyHook = {
            type: "command" as const,
            bash: AGENT_SHELL_POLICY_CHECK,
            timeoutSec: 30,
        };
        mergedConfig.hooks.preToolUse = [
            ...(mergedConfig.hooks.preToolUse ?? []),
            policyHook,
        ];
    }

    if (enableFlightRecorder && !existing.hasPostToolUse) {
        const recordHook = {
            type: "command" as const,
            bash: AGENT_SHELL_RECORD,
            timeoutSec: 30,
        };
        mergedConfig.hooks.postToolUse = [
            ...(mergedConfig.hooks.postToolUse ?? []),
            recordHook,
        ];
    }

    const hooksContent = `${JSON.stringify(mergedConfig, null, 2)}\n`;

    const hooksWritten = await writeConfigFile(
        repoRoot,
        HOOKS_SUBPATH,
        hooksContent,
        deps,
    );

    if (!hooksWritten) {
        return false;
    }

    // Generate policy.json if policy is being enabled and no policy file exists yet.
    // If the file already exists, ensure agent-shell's own commands are in the allow list
    // so that the preToolUse hook doesn't block the sibling postToolUse hook.
    if (enablePolicy) {
        const policyPath = join(repoRoot, POLICY_SUBPATH);
        let existingContent: string | null = null;

        try {
            existingContent = await deps.readFile(policyPath, "utf-8");
        } catch (error: unknown) {
            if (!isPathNotFoundError(error)) {
                throw error;
            }
        }

        if (existingContent === null) {
            deps.writeStdout("Scanning project...\n");
            const scanResult = await deps.scanProject(repoRoot);
            const policy = generatePolicy(scanResult);
            const policyContent = `${JSON.stringify(policy, null, 2)}\n`;

            const policyWritten = await writeConfigFile(
                repoRoot,
                POLICY_SUBPATH,
                policyContent,
                deps,
            );
            if (!policyWritten) {
                return false;
            }
        } else {
            // Ensure agent-shell commands are in the existing allow list
            const patchResult = ensureAgentShellAllowed(existingContent);
            switch (patchResult.status) {
                case "patched": {
                    const policyWritten = await writeConfigFile(
                        repoRoot,
                        POLICY_SUBPATH,
                        patchResult.content,
                        deps,
                    );
                    if (!policyWritten) {
                        return false;
                    }
                    break;
                }
                case "unchanged":
                    deps.writeStdout(
                        "Policy already exists with agent-shell rules; skipping policy.json generation.\n",
                    );
                    break;
                case "invalid":
                    deps.writeStderr(
                        `agent-shell: existing policy.json is invalid (${sanitizeForStderr(patchResult.reason)}), regenerating\n`,
                    );
                    deps.writeStdout("Scanning project...\n");
                    {
                        const scanResult = await deps.scanProject(repoRoot);
                        const policy = generatePolicy(scanResult);
                        const policyContent = `${JSON.stringify(policy, null, 2)}\n`;
                        const policyWritten = await writeConfigFile(
                            repoRoot,
                            POLICY_SUBPATH,
                            policyContent,
                            deps,
                        );
                        if (!policyWritten) {
                            return false;
                        }
                    }
                    break;
                default: {
                    const _exhaustive: never = patchResult;
                    throw new Error(
                        `Unhandled policy patch status: ${(_exhaustive as PolicyPatchResult).status}`,
                    );
                }
            }
        }
    }

    // Print summary
    const actions: string[] = [];
    if (enableFlightRecorder) actions.push("flight recording");
    if (enablePolicy) actions.push("policy blocking");

    deps.writeStdout(`\nEnabled: ${actions.join(", ")}\n`);
    return true;
}
