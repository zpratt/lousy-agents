import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Represents a discovered npm script from package.json.
 */
export interface DiscoveredScript {
    name: string;
    command: string;
}

/**
 * Represents a discovered mise task.
 */
export interface MiseTask {
    name: string;
    command: string;
}

/**
 * Result of scanning a project directory for tools and commands.
 */
export interface ProjectScanResult {
    /** npm scripts from package.json */
    scripts: DiscoveredScript[];
    /** Run commands from GitHub Actions workflow files */
    workflowCommands: string[];
    /** Tasks from mise.toml */
    miseTasks: MiseTask[];
    /** Detected programming languages */
    languages: string[];
}

const LANGUAGE_MARKERS: Record<string, string> = {
    "package.json": "node",
    "requirements.txt": "python",
    // biome-ignore lint/style/useNamingConvention: filename on disk
    Pipfile: "python",
    "pyproject.toml": "python",
    "setup.py": "python",
    "go.mod": "go",
    "Cargo.toml": "rust",
    // biome-ignore lint/style/useNamingConvention: filename on disk
    Gemfile: "ruby",
    "pom.xml": "java",
    "build.gradle": "java",
    "build.gradle.kts": "java",
};

async function fileExists(path: string): Promise<boolean> {
    try {
        const { stat } = await import("node:fs/promises");
        const s = await stat(path);
        return s.isFile();
    } catch {
        return false;
    }
}

async function dirExists(path: string): Promise<boolean> {
    try {
        const { stat } = await import("node:fs/promises");
        const s = await stat(path);
        return s.isDirectory();
    } catch {
        return false;
    }
}

async function discoverScripts(targetDir: string): Promise<DiscoveredScript[]> {
    const packageJsonPath = join(targetDir, "package.json");

    if (!(await fileExists(packageJsonPath))) {
        return [];
    }

    try {
        const content = await readFile(packageJsonPath, "utf-8");
        const parsed: unknown = JSON.parse(content);

        if (
            parsed === null ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
        ) {
            return [];
        }

        const pkg = parsed as Record<string, unknown>;
        const scripts = pkg.scripts;

        if (
            scripts === null ||
            scripts === undefined ||
            typeof scripts !== "object" ||
            Array.isArray(scripts)
        ) {
            return [];
        }

        const result: DiscoveredScript[] = [];
        for (const [name, command] of Object.entries(
            scripts as Record<string, unknown>,
        )) {
            if (typeof command === "string") {
                result.push({ name, command });
            }
        }
        return result;
    } catch {
        return [];
    }
}

async function discoverWorkflowCommands(targetDir: string): Promise<string[]> {
    const workflowsDir = join(targetDir, ".github", "workflows");

    if (!(await dirExists(workflowsDir))) {
        return [];
    }

    let files: string[];
    try {
        files = await readdir(workflowsDir);
    } catch {
        return [];
    }

    const yamlFiles = files.filter(
        (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    );

    const allCommands: string[] = [];

    for (const file of yamlFiles) {
        try {
            const content = await readFile(join(workflowsDir, file), "utf-8");
            // Use a simple YAML-like parser for run commands
            // We need to import yaml dynamically since agent-shell doesn't
            // have it as a dependency - instead do simple extraction
            const commands = extractRunCommandsFromYaml(content);
            allCommands.push(...commands);
        } catch {
            // Skip unreadable files
        }
    }

    // Deduplicate
    return [...new Set(allCommands)].filter(isUsefulCommand);
}

/**
 * Shell builtins and control flow patterns that should not appear
 * in an allow list.
 */
const SHELL_NOISE_PATTERNS = [
    /^(if|then|else|elif|fi|for|while|do|done|case|esac)\b/,
    /^(set\s+[+-]e|set\s+[+-]o)/,
    /^(exit\s+\d|exit\s+\$)/,
    /^\w+="?\$\{\{/, // variable assignments from GH expressions
    /^[A-Z_]+=("[^"]*"|'[^']*'|\S+)\s*\\?$/, // env var assignments
    /^(echo|printf)\s/, // echo/printf statements
    /^(cd|mkdir|rm|test)\s/, // directory manipulation and test assertions
    /^>\s/, // redirections
    /^(else|fi|done|esac)$/, // bare control flow keywords
    /^\w+=\$\?$/, // exit code capture
    /^\\$/, // line continuations
    /^'[^']*'\s*\\?$/, // bare string arguments (continuation lines)
    /^"[^"]*"\s*\\?$/, // bare double-quoted strings
    /^node\s+"?\$/, // node with variable script path
];

function isUsefulCommand(cmd: string): boolean {
    // Skip short fragments
    if (cmd.length < 3) return false;

    // Skip lines ending with backslash (continuation lines) unless they're complete commands
    if (cmd.endsWith("\\") && !cmd.includes(" -c ")) return false;

    // Skip lines that are clearly subshell or redirection fragments
    if (cmd.endsWith(")") && !cmd.includes("(")) return false;

    return !SHELL_NOISE_PATTERNS.some((pattern) => pattern.test(cmd));
}

/**
 * Simple extraction of `run:` values from YAML content.
 * Uses line-based parsing rather than a full YAML parser to avoid
 * adding yaml as a dependency to agent-shell.
 */
function extractRunCommandsFromYaml(content: string): string[] {
    const commands: string[] = [];
    const lines = content.split("\n");

    let inRunBlock = false;
    let runIndent = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;

        const trimmed = line.trimStart();
        const indent = line.length - trimmed.length;

        if (inRunBlock) {
            // We're inside a multi-line run: | block
            if (trimmed.length === 0) {
                // Empty line in block - continue
                continue;
            }
            if (indent > runIndent) {
                // This is content inside the run block
                const cmd = trimmed.trim();
                if (cmd.length > 0 && !cmd.startsWith("#")) {
                    commands.push(cmd);
                }
            } else {
                // Block ended
                inRunBlock = false;
            }
        }

        if (!inRunBlock) {
            // Look for `- run:` or `run:` patterns
            const runMatch = trimmed.match(/^-?\s*run:\s*(.*)$/);
            if (runMatch) {
                const value = runMatch[1]?.trim();
                if (value === "|" || value === ">") {
                    // Multi-line block
                    inRunBlock = true;
                    runIndent = indent;
                } else if (value && value.length > 0) {
                    // Single-line run command
                    // Remove surrounding quotes if present
                    const unquoted = value.replace(/^["'](.*)["']$/, "$1");
                    if (unquoted.length > 0 && !unquoted.startsWith("#")) {
                        commands.push(unquoted);
                    }
                }
            }
        }
    }

    return commands;
}

/**
 * Parse mise.toml to extract task definitions.
 * Uses simple line-based parsing for [tasks.*] sections.
 */
async function discoverMiseTasks(targetDir: string): Promise<MiseTask[]> {
    const miseTomlPath = join(targetDir, "mise.toml");

    if (!(await fileExists(miseTomlPath))) {
        return [];
    }

    try {
        const content = await readFile(miseTomlPath, "utf-8");
        return parseMiseTomlTasks(content);
    } catch {
        return [];
    }
}

function parseMiseTomlTasks(content: string): MiseTask[] {
    const tasks: MiseTask[] = [];
    const lines = content.split("\n");

    let currentTaskName: string | null = null;
    let inMultiLineRun = false;
    let multiLineCommand = "";

    for (const line of lines) {
        const trimmed = line.trim();

        // Handle multi-line run block (triple-quoted)
        if (inMultiLineRun) {
            if (trimmed === '"""' || trimmed === "'''") {
                // End of multi-line block
                inMultiLineRun = false;
                const cmd = multiLineCommand.trim();
                if (currentTaskName !== null && cmd.length > 0) {
                    // Use the first non-empty line as the command
                    const firstLine = cmd
                        .split("\n")
                        .map((l) => l.trim())
                        .find((l) => l.length > 0);
                    if (firstLine) {
                        tasks.push({
                            name: currentTaskName,
                            command: firstLine,
                        });
                    }
                }
                multiLineCommand = "";
                continue;
            }
            multiLineCommand += `${trimmed}\n`;
            continue;
        }

        // Match [tasks.name] sections
        const sectionMatch = trimmed.match(/^\[tasks\.([^\]]+)\]$/);
        if (sectionMatch?.[1]) {
            currentTaskName = sectionMatch[1];
            continue;
        }

        // Match new section start (exits current task)
        if (trimmed.startsWith("[") && !trimmed.startsWith("[tasks.")) {
            currentTaskName = null;
            continue;
        }

        // Match run = "command" within a task section
        if (currentTaskName !== null) {
            // Check for multi-line start: run = """
            if (
                /^run\s*=\s*"""/.test(trimmed) ||
                /^run\s*=\s*'''/.test(trimmed)
            ) {
                inMultiLineRun = true;
                multiLineCommand = "";
                continue;
            }

            const runMatch = trimmed.match(
                /^run\s*=\s*(?:"([^"]*)"|'([^']*)')/,
            );
            if (runMatch) {
                const command = runMatch[1] ?? runMatch[2] ?? "";
                if (command.length > 0) {
                    tasks.push({ name: currentTaskName, command });
                }
            }
        }
    }

    return tasks;
}

async function detectLanguages(targetDir: string): Promise<string[]> {
    const detected = new Set<string>();

    for (const [filename, language] of Object.entries(LANGUAGE_MARKERS)) {
        if (await fileExists(join(targetDir, filename))) {
            detected.add(language);
        }
    }

    return [...detected];
}

/**
 * Scans a project directory to discover tools, commands, and languages.
 * Uses static file analysis without requiring external dependencies.
 */
export async function scanProject(
    targetDir: string,
): Promise<ProjectScanResult> {
    const [scripts, workflowCommands, miseTasks, languages] = await Promise.all(
        [
            discoverScripts(targetDir),
            discoverWorkflowCommands(targetDir),
            discoverMiseTasks(targetDir),
            detectLanguages(targetDir),
        ],
    );

    return {
        scripts,
        workflowCommands,
        miseTasks,
        languages,
    };
}
