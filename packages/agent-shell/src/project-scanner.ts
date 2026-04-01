import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const MAX_WORKFLOW_FILES = 100;
const MAX_FILE_SIZE_BYTES = 524_288;

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
        const s = await stat(path);
        return s.isFile();
    } catch {
        return false;
    }
}

async function dirExists(path: string): Promise<boolean> {
    try {
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
        const fileStat = await stat(packageJsonPath);
        if (fileStat.size > MAX_FILE_SIZE_BYTES) {
            return [];
        }
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

    const yamlFiles = files
        .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
        .slice(0, MAX_WORKFLOW_FILES);

    const allCommands: string[] = [];

    for (const file of yamlFiles) {
        try {
            const filePath = join(workflowsDir, file);
            const fileStat = await stat(filePath);
            if (fileStat.size > MAX_FILE_SIZE_BYTES) {
                continue;
            }
            const content = await readFile(filePath, "utf-8");
            const commands = extractRunCommandsFromYaml(content);
            allCommands.push(...commands);
        } catch {}
    }

    return [...new Set(allCommands)].filter(isUsefulCommand);
}

/**
 * Patterns that match shell control structures, variable assignments,
 * and other non-command lines extracted from multi-line workflow `run:`
 * blocks. These are filtered out because they are not meaningful tool
 * invocations that should appear in a policy allow list — only actual
 * commands (npm, mise, node, git, etc.) are useful for policy rules.
 */
const SHELL_NOISE_PATTERNS = [
    /^(if|then|else|elif|fi|for|while|do|done|case|esac)\b/,
    /^(set\s+[+-]e|set\s+[+-]o)/,
    /^(exit\s+\d|exit\s+\$)/,
    /^\w+="?\$\{\{/,
    /^[A-Z_]+=("[^"]*"|'[^']*'|\S+)\s*\\?$/,
    /^(echo|printf)\s/,
    /^(cd|mkdir|rm|test)\s/,
    /^>\s/,
    /^(else|fi|done|esac)$/,
    /^\w+=\$\?$/,
    /^\\$/,
    /^'[^']*'\s*\\?$/,
    /^"[^"]*"\s*\\?$/,
    /^node\s+"?\$/,
];

function isUsefulCommand(cmd: string): boolean {
    if (cmd.length < 3) return false;
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
    let isFoldedBlock = false;
    let foldedLines: string[] = [];
    let continuationBuffer = "";

    function flushFoldedBlock(): void {
        if (foldedLines.length > 0) {
            commands.push(foldedLines.join(" "));
            foldedLines = [];
        }
    }

    function flushContinuation(): void {
        if (continuationBuffer.length > 0) {
            commands.push(continuationBuffer);
            continuationBuffer = "";
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;

        const trimmed = line.trimStart();
        const indent = line.length - trimmed.length;

        if (inRunBlock) {
            if (trimmed.length === 0) {
                continue;
            }
            if (indent > runIndent) {
                let cmd = trimmed.trimEnd();
                cmd = cmd.replace(/\s+#.*$/, "").trimEnd();
                const isContinuation = cmd.endsWith("\\");
                if (isContinuation) {
                    cmd = cmd.slice(0, -1).trimEnd();
                }
                if (cmd.length > 0 && !cmd.startsWith("#")) {
                    if (isFoldedBlock) {
                        foldedLines.push(cmd);
                    } else if (isContinuation) {
                        continuationBuffer =
                            continuationBuffer.length > 0
                                ? `${continuationBuffer} ${cmd}`
                                : cmd;
                    } else if (continuationBuffer.length > 0) {
                        commands.push(`${continuationBuffer} ${cmd}`);
                        continuationBuffer = "";
                    } else {
                        commands.push(cmd);
                    }
                }
            } else {
                flushContinuation();
                if (isFoldedBlock) {
                    flushFoldedBlock();
                }
                inRunBlock = false;
                isFoldedBlock = false;
            }
        }

        if (!inRunBlock) {
            const runMatch = trimmed.match(/^-?\s*run:\s*(.*)$/);
            if (runMatch) {
                const value = runMatch[1]?.trim();
                const firstToken = value
                    ? (value.split(/[ \t#]/, 1)[0] ?? "")
                    : "";
                if (/^[|>][-+]?$/.test(firstToken)) {
                    inRunBlock = true;
                    runIndent = indent;
                    isFoldedBlock = firstToken.startsWith(">");
                    foldedLines = [];
                } else if (value && value.length > 0) {
                    let command: string;
                    const quoteMatch = value.match(/^(["'])(.*)\1/);
                    if (quoteMatch) {
                        command = quoteMatch[2] ?? "";
                    } else {
                        command = value.replace(/\s+#.*$/, "").trim();
                    }
                    if (command.length > 0 && !command.startsWith("#")) {
                        commands.push(command);
                    }
                }
            }
        }
    }

    flushContinuation();
    if (isFoldedBlock) {
        flushFoldedBlock();
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
        const fileStat = await stat(miseTomlPath);
        if (fileStat.size > MAX_FILE_SIZE_BYTES) {
            return [];
        }
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

        if (inMultiLineRun) {
            if (trimmed === '"""' || trimmed === "'''") {
                inMultiLineRun = false;
                const cmd = multiLineCommand.trim();
                if (currentTaskName !== null && cmd.length > 0) {
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

        const sectionMatch = trimmed.match(/^\[tasks\.([^\]]+)\]$/);
        if (sectionMatch?.[1]) {
            currentTaskName = sectionMatch[1];
            continue;
        }

        if (trimmed.startsWith("[") && !trimmed.startsWith("[tasks.")) {
            currentTaskName = null;
            continue;
        }

        if (currentTaskName !== null) {
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
