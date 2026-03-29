import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { enhanceWithCopilot } from "./copilot-enhance.js";
import { type ProjectScanResult, scanProject } from "./project-scanner.js";

export interface PolicyInitDeps {
    getRepositoryRoot: () => string;
    writeStdout: (data: string) => void;
    writeStderr: (data: string) => void;
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
    };
}

const DEFAULT_SAFE_COMMANDS = [
    "git *",
    "cat *",
    "ls *",
    "pwd",
    "echo *",
    "head *",
    "tail *",
    "wc *",
    "grep *",
    "find *",
    "which *",
];

const DEFAULT_DENY_RULES = [
    "rm -rf *",
    "sudo *",
    "curl * | sh",
    "curl * | bash",
    "wget * | sh",
    "wget * | bash",
];

const POLICY_SUBPATH = ".github/hooks/agent-shell/policy.json";
const HOOKS_SUBPATH = ".github/copilot/hooks.json";

/**
 * Generates a policy configuration from project scan results.
 * Creates an allow list of commands discovered in the project,
 * plus common safe defaults. Includes standard deny rules.
 *
 * Allow rules use exact match by default to prevent shell
 * metacharacter bypass (e.g. `npm test && curl evil`).
 * Wildcard `*` is only used for commands where subcommand
 * arguments are inherently expected (e.g. `git *`).
 */
export function generatePolicy(scanResult: ProjectScanResult): GeneratedPolicy {
    const allowSet = new Set<string>();

    // Add default safe commands
    for (const cmd of DEFAULT_SAFE_COMMANDS) {
        allowSet.add(cmd);
    }

    // Add npm script commands as exact matches — no trailing wildcards
    // to prevent shell metacharacter injection (e.g. `npm test; rm -rf /`).
    for (const script of scanResult.scripts) {
        if (script.name === "test") {
            allowSet.add("npm test");
        } else {
            allowSet.add(`npm run ${script.name}`);
        }
    }

    // Add workflow commands
    for (const cmd of scanResult.workflowCommands) {
        // Normalize common patterns — exact match only
        if (cmd === "npm test" || cmd.startsWith("npm test ")) {
            allowSet.add("npm test");
        } else if (cmd.startsWith("npm run ")) {
            const scriptPart = cmd.slice("npm run ".length).split(" ")[0];
            allowSet.add(`npm run ${scriptPart}`);
        } else if (cmd === "npm ci" || cmd === "npm install") {
            allowSet.add(cmd);
        } else if (cmd.startsWith("npx ")) {
            allowSet.add(cmd);
        } else if (cmd.startsWith("mise run ")) {
            const taskPart = cmd.slice("mise run ".length).split(" ")[0];
            allowSet.add(`mise run ${taskPart}`);
        } else {
            allowSet.add(cmd);
        }
    }

    // Add mise task commands as exact matches
    for (const task of scanResult.miseTasks) {
        allowSet.add(`mise run ${task.name}`);
    }

    // Add mise install if mise is detected
    if (scanResult.miseTasks.length > 0) {
        allowSet.add("mise install");
    }

    // Sort allow rules for deterministic output
    const allow = [...allowSet].sort();

    return {
        allow,
        deny: [...DEFAULT_DENY_RULES],
    };
}

/**
 * Generates the Copilot hooks.json configuration with agent-shell
 * policy-check as a preToolUse hook.
 */
export function generateHooksConfig(): GeneratedHooksConfig {
    return {
        version: 1,
        hooks: {
            preToolUse: [
                {
                    type: "command",
                    bash: "agent-shell policy-check",
                    // 30s is generous for a fast JSON parse + policy eval;
                    // provides headroom for cold-start or slow disk I/O
                    // without blocking the agent indefinitely.
                    timeoutSec: 30,
                },
            ],
        },
    };
}

async function fileExists(path: string): Promise<boolean> {
    try {
        const s = await stat(path);
        return s.isFile();
    } catch {
        return false;
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

    // Try to enhance with Copilot SDK
    const enhanced = await enhanceWithCopilot(
        scanResult,
        repoRoot,
        deps.writeStderr,
    );

    if (enhanced !== null) {
        deps.writeStdout("Enhanced with Copilot analysis\n");
        for (const rule of enhanced.additionalAllowRules) {
            if (!policy.allow.includes(rule)) {
                policy.allow.push(rule);
            }
        }
        policy.allow.sort();

        if (enhanced.suggestions.length > 0) {
            deps.writeStdout("\nSuggestions from Copilot:\n");
            for (const suggestion of enhanced.suggestions) {
                deps.writeStdout(`  - ${suggestion}\n`);
            }
        }
    }

    const hooksConfig = generateHooksConfig();

    const policyPath = join(repoRoot, POLICY_SUBPATH);
    const hooksPath = join(repoRoot, HOOKS_SUBPATH);

    // Write policy.json (skip if exists)
    if (await fileExists(policyPath)) {
        deps.writeStdout(`Skipping ${POLICY_SUBPATH} — file already exists\n`);
    } else {
        const policyDir = join(repoRoot, ".github", "hooks", "agent-shell");
        await mkdir(policyDir, { recursive: true });
        await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
        deps.writeStdout(`Created ${POLICY_SUBPATH}\n`);
    }

    // Write hooks.json (skip if exists)
    if (await fileExists(hooksPath)) {
        deps.writeStdout(`Skipping ${HOOKS_SUBPATH} — file already exists\n`);
    } else {
        const hooksDir = join(repoRoot, ".github", "copilot");
        await mkdir(hooksDir, { recursive: true });
        await writeFile(hooksPath, `${JSON.stringify(hooksConfig, null, 2)}\n`);
        deps.writeStdout(`Created ${HOOKS_SUBPATH}\n`);
    }

    // Print summary
    deps.writeStdout("\n--- Proposed Policy ---\n");
    deps.writeStdout(`${JSON.stringify(policy, null, 2)}\n`);
    deps.writeStdout("\n--- Hook Configuration ---\n");
    deps.writeStdout(`${JSON.stringify(hooksConfig, null, 2)}\n`);
}
