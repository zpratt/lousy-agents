import { join, resolve } from "node:path";
import { isPathNotFoundError, isWithinProjectRoot } from "./path-utils.js";
import { generatePolicy } from "./policy-init.js";
import type { ProjectScanResult } from "./project-scanner.js";
import { sanitizeForStderr } from "./sanitize.js";
import type { HooksConfig } from "./types.js";
import { HooksConfigSchema } from "./types.js";

const HOOKS_SUBPATH = ".github/hooks/agent-shell/hooks.json";
const POLICY_SUBPATH = ".github/hooks/agent-shell/policy.json";
const HOOKS_PARENT = ".github/hooks/agent-shell";

export interface InitDeps {
    getRepositoryRoot: () => string;
    writeStdout: (data: string) => void;
    writeStderr: (data: string) => void;
    readFile: (path: string, encoding: "utf-8") => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
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

/**
 * Ensures agent-shell's own commands are in an existing policy.json allow list.
 * Returns the patched JSON string if changes were needed, or null if all entries
 * are already present. Preserves all existing user rules.
 */
export function ensureAgentShellAllowed(content: string): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        // Corrupted policy — don't attempt to patch
        return null;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return null;
    }

    const policy = parsed as Record<string, unknown>;
    const allow = Array.isArray(policy.allow) ? [...policy.allow] : [];

    const missing = AGENT_SHELL_ALLOW_ENTRIES.filter(
        (entry) => !allow.includes(entry),
    );

    if (missing.length === 0) {
        return null;
    }

    allow.push(...missing);
    const patched = { ...policy, allow };
    return `${JSON.stringify(patched, null, 2)}\n`;
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
    } catch {
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
        "writeFile" | "mkdir" | "realpath" | "writeStdout" | "writeStderr"
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
    } catch {
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

    await deps.writeFile(filePath, content);
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
                "Enable flight recording (postToolUse hook)?",
            );
        }

        if (!existing.hasPreToolUse) {
            enablePolicy = await deps.prompt(
                "Enable policy blocking (preToolUse hook)?",
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
            const patched = ensureAgentShellAllowed(existingContent);
            if (patched !== null) {
                const policyWritten = await writeConfigFile(
                    repoRoot,
                    POLICY_SUBPATH,
                    patched,
                    deps,
                );
                if (!policyWritten) {
                    return false;
                }
            } else {
                deps.writeStdout(
                    "Policy already exists with agent-shell rules; skipping policy.json generation.\n",
                );
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
