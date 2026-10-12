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
