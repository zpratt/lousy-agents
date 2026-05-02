import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    type ProjectScanResult,
    scanProject,
} from "../gateways/project-scanner.js";
import {
    isSafeCommand,
    SHELL_METACHAR_PATTERN,
    sanitizeOutput,
} from "../lib/sanitize.js";
import { enhanceWithCopilot } from "./copilot-enhance.js";

export interface PolicyInitDeps {
    getRepositoryRoot: () => string;
    writeStdout: (data: string) => void;
    writeStderr: (data: string) => void;
    model?: string;
}

interface GeneratedPolicy {
    allow: string[];
    deny: string[];
}

interface GeneratedHooksConfig {
    version: 1;
    hooks: {
        preToolUse?: Array<{
            type: "command";
            bash: string;
            timeoutSec?: number;
        }>;
        postToolUse?: Array<{
            type: "command";
            bash: string;
            timeoutSec?: number;
        }>;
    };
}

// Exact-match entries for agent-shell's own commands prevent the preToolUse
// hook from blocking its sibling hooks. Wildcard entries (ending with *) cover
// common read-only git commands. The final allow list is sorted alphabetically.
const DEFAULT_SAFE_COMMANDS = [
    "agent-shell policy-check",
    "agent-shell record",
    "git status *",
    "git diff *",
    "git log *",
    "git show *",
    "git branch --show-current",
    "git branch --list *",
    "git rev-parse *",
    "pwd",
];

const DEFAULT_DENY_RULES = ["rm -rf *", "sudo *"];

const POLICY_SUBPATH = ".github/hooks/agent-shell/policy.json";
const HOOKS_SUBPATH = ".github/hooks/agent-shell/hooks.json";

/**
 * Extracts the script or task name from a command string, skipping any
 * flags (tokens starting with `-`) that appear between the prefix and
 * the actual name. For example, `npm run -s build` or `npm run --silent build`
 * both return `build`. Splits on any whitespace to avoid empty tokens from
 * multiple consecutive spaces.
 */
function extractNameAfterPrefix(cmd: string, prefix: string): string {
    const tokens = cmd.slice(prefix.length).trim().split(/\s+/);
    for (const token of tokens) {
        if (token.length > 0 && !token.startsWith("-")) {
            return token;
        }
    }
    return "";
}

/**
 * Generates a policy configuration from project scan results.
 * Creates an allow list of commands discovered in the project,
 * plus common safe defaults. Includes standard deny rules.
 *
 * Allow rules use exact match by default to prevent shell
 * metacharacter bypass (e.g. `npm test && curl evil`).
 * Wildcard `*` is only used for commands where subcommand
 * arguments are inherently expected and the base command
 * is genuinely read-only (e.g. `git status *`).
 */
export function generatePolicy(scanResult: ProjectScanResult): GeneratedPolicy {
    const allowSet = new Set<string>();

    for (const cmd of DEFAULT_SAFE_COMMANDS) {
        allowSet.add(cmd);
    }

    for (const script of scanResult.scripts) {
        const name = script.name.trim();
        if (name.length === 0) {
            continue;
        }
        if (SHELL_METACHAR_PATTERN.test(name)) {
            continue;
        }
        if (name === "test") {
            allowSet.add("npm test");
        } else {
            allowSet.add(`npm run ${name}`);
        }
    }

    for (const cmd of scanResult.workflowCommands) {
        if (cmd === "npm test" || cmd.startsWith("npm test ")) {
            allowSet.add("npm test");
            if (cmd !== "npm test" && !SHELL_METACHAR_PATTERN.test(cmd)) {
                allowSet.add(cmd);
            }
        } else if (cmd.startsWith("npm run ")) {
            const scriptName = extractNameAfterPrefix(cmd, "npm run ");
            if (scriptName) {
                allowSet.add(`npm run ${scriptName}`);
                if (
                    cmd !== `npm run ${scriptName}` &&
                    !SHELL_METACHAR_PATTERN.test(cmd)
                ) {
                    allowSet.add(cmd);
                }
            } else if (!SHELL_METACHAR_PATTERN.test(cmd)) {
                allowSet.add(cmd);
            }
        } else if (cmd === "npm ci" || cmd === "npm install") {
            allowSet.add(cmd);
        } else if (cmd.startsWith("npx ")) {
            if (!SHELL_METACHAR_PATTERN.test(cmd)) {
                allowSet.add(cmd);
            }
        } else if (cmd.startsWith("mise run ")) {
            const taskName = extractNameAfterPrefix(cmd, "mise run ");
            if (taskName) {
                allowSet.add(`mise run ${taskName}`);
                if (
                    cmd !== `mise run ${taskName}` &&
                    !SHELL_METACHAR_PATTERN.test(cmd)
                ) {
                    allowSet.add(cmd);
                }
            } else if (!SHELL_METACHAR_PATTERN.test(cmd)) {
                allowSet.add(cmd);
            }
        } else {
            if (!SHELL_METACHAR_PATTERN.test(cmd)) {
                allowSet.add(cmd);
            }
        }
    }

    for (const task of scanResult.miseTasks) {
        const taskName = task.name.trim();
        if (taskName.length > 0 && !SHELL_METACHAR_PATTERN.test(taskName)) {
            allowSet.add(`mise run ${taskName}`);
        }
    }

    if (scanResult.miseTasks.length > 0) {
        allowSet.add("mise install");
    }

    const allow = [...allowSet].sort();

    return {
        allow,
        deny: [...DEFAULT_DENY_RULES],
    };
}

export interface HooksConfigOptions {
    flightRecorder?: boolean;
    policyCheck?: boolean;
}

/**
 * Generates the Copilot hooks.json configuration with agent-shell
 * hooks based on the provided feature flags.
 * Defaults to policyCheck only for backward compatibility.
 */
export function generateHooksConfig(
    options: HooksConfigOptions = {},
): GeneratedHooksConfig {
    const { flightRecorder, policyCheck } = {
        policyCheck: true,
        ...options,
    };

    const config: GeneratedHooksConfig = {
        version: 1,
        hooks: {},
    };

    if (policyCheck) {
        config.hooks.preToolUse = [
            {
                type: "command",
                bash: "agent-shell policy-check",
                timeoutSec: 30,
            },
        ];
    }

    if (flightRecorder) {
        config.hooks.postToolUse = [
            {
                type: "command",
                bash: "agent-shell record",
                timeoutSec: 30,
            },
        ];
    }

    return config;
}

/**
 * Writes a file atomically, skipping if the file already exists.
 * Uses the `wx` (exclusive create) flag to avoid TOCTOU races
 * between a check and write.
 */
async function writeFileIfNotExists(
    filePath: string,
    parentDir: string,
    content: string,
    subpath: string,
    writeStdout: (data: string) => void,
): Promise<void> {
    await mkdir(parentDir, { recursive: true });
    try {
        await writeFile(filePath, content, { flag: "wx" });
        writeStdout(`Created ${subpath}\n`);
    } catch (error: unknown) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "EEXIST"
        ) {
            writeStdout(`Skipping ${subpath} — file already exists\n`);
        } else {
            throw error;
        }
    }
}

/**
 * Handles the `policy --init` command.
 * Scans the project, generates a policy and hooks configuration,
 * and writes them to disk. Optionally uses @github/copilot-sdk
 * for AI-enhanced analysis when available.
 */
export async function handlePolicyInit(deps: PolicyInitDeps): Promise<void> {
    const repoRoot = deps.getRepositoryRoot();

    deps.writeStdout("Scanning project...\n");

    const scanResult = await scanProject(repoRoot);

    deps.writeStdout(
        `Discovered: ${scanResult.scripts.length} npm script(s), ` +
            `${scanResult.workflowCommands.length} workflow command(s), ` +
            `${scanResult.miseTasks.length} mise task(s), ` +
            `${scanResult.languages.length} language(s)\n`,
    );

    const policy = generatePolicy(scanResult);

    const enhanced = await enhanceWithCopilot(
        scanResult,
        repoRoot,
        deps.writeStderr,
        deps.model,
    );

    if (enhanced !== null) {
        deps.writeStdout("Enhanced with Copilot analysis\n");

        if (enhanced.additionalAllowRules.length > 0) {
            deps.writeStdout(
                "\nSuggested additional allow rules from Copilot (not auto-applied):\n",
            );
            for (const rule of enhanced.additionalAllowRules) {
                if (isSafeCommand(rule)) {
                    deps.writeStdout(`  - ${sanitizeOutput(rule)}\n`);
                } else {
                    deps.writeStdout(
                        `  - [UNSAFE, skipped] ${sanitizeOutput(rule)}\n`,
                    );
                }
            }
        }

        if (enhanced.suggestions.length > 0) {
            deps.writeStdout("\nSuggestions from Copilot:\n");
            for (const suggestion of enhanced.suggestions) {
                deps.writeStdout(`  - ${sanitizeOutput(suggestion)}\n`);
            }
        }
    }

    const hooksConfig = generateHooksConfig();

    const policyPath = join(repoRoot, POLICY_SUBPATH);
    const hooksPath = join(repoRoot, HOOKS_SUBPATH);
    const policyContent = `${JSON.stringify(policy, null, 2)}\n`;
    const hooksContent = `${JSON.stringify(hooksConfig, null, 2)}\n`;

    await writeFileIfNotExists(
        policyPath,
        join(repoRoot, ".github", "hooks", "agent-shell"),
        policyContent,
        POLICY_SUBPATH,
        deps.writeStdout,
    );

    await writeFileIfNotExists(
        hooksPath,
        join(repoRoot, ".github", "hooks", "agent-shell"),
        hooksContent,
        HOOKS_SUBPATH,
        deps.writeStdout,
    );

    deps.writeStdout("\n--- Proposed Policy ---\n");
    deps.writeStdout(`${sanitizeOutput(JSON.stringify(policy, null, 2))}\n`);
    deps.writeStdout("\n--- Hook Configuration ---\n");
    deps.writeStdout(
        `${sanitizeOutput(JSON.stringify(hooksConfig, null, 2))}\n`,
    );
}
