import type { EdgeType, HarnessName } from "./edge-types.js";

export interface CrossRefMechanism {
    edgeType: EdgeType;
    description: string;
}

export type FootprintStatus = "verified" | "needs-verification";
export type WalkBoundary = "git-root" | "filesystem-root" | "project" | null;

export interface HarnessFootprint {
    name: HarnessName;
    status: FootprintStatus;
    readsAgentsMd: boolean;
    walkBoundary: WalkBoundary;
    conventionFiles: readonly string[];
    conventionDirs: readonly string[];
    /**
     * Convention files this harness only loads when they sit at the
     * repository root — unlike conventionFiles, these are not discovered
     * via walkBoundary and are ignored anywhere else in the tree.
     */
    rootOnlyConventionFiles?: readonly string[];
    crossRefMechanisms: readonly CrossRefMechanism[];
    /**
     * Patterns used to detect whether a file belongs to this harness.
     * Each entry is either:
     *   - An exact repo-relative path (e.g. "CLAUDE.md")
     *   - A directory prefix ending with "/" (e.g. ".claude/") — matches any
     *     file whose path starts with that prefix
     * A file is assigned this harness when exactly one harness's primary
     * indicators match. Two or more matches → "shared".
     */
    primaryIndicators: readonly string[];
}

export const HARNESS_NAMES: readonly HarnessName[] = [
    "claude",
    "copilot",
    "codex",
    "antigravity",
    "hermes",
    "crush",
    "pi",
] as const;

export const HARNESS_FOOTPRINTS: Readonly<
    Record<HarnessName, HarnessFootprint>
> = {
    claude: {
        name: "claude",
        status: "verified",
        readsAgentsMd: false,
        walkBoundary: "git-root",
        conventionFiles: ["CLAUDE.md"],
        conventionDirs: [".claude/"],
        primaryIndicators: ["CLAUDE.md", ".claude/"],
        crossRefMechanisms: [
            {
                edgeType: "hard-import",
                description:
                    "Claude @path/to/file syntax at line start inlines the referenced file",
            },
            {
                edgeType: "soft-reference",
                description:
                    "Frontmatter see:/references:/requires: keys or markdown links to sibling instruction files",
            },
        ],
    },

    copilot: {
        name: "copilot",
        status: "verified",
        readsAgentsMd: false,
        walkBoundary: "project",
        conventionFiles: [".github/copilot-instructions.md"],
        conventionDirs: [".github/instructions/"],
        rootOnlyConventionFiles: ["CLAUDE.md", "GEMINI.md"],
        primaryIndicators: [
            ".github/copilot-instructions.md",
            ".github/instructions/",
        ],
        crossRefMechanisms: [
            {
                edgeType: "glob-binding",
                description:
                    "Copilot applyTo frontmatter field scopes an instruction to matching source files",
            },
            {
                edgeType: "soft-reference",
                description:
                    "Frontmatter see:/references:/requires: keys or markdown links to sibling instruction files",
            },
        ],
    },

    codex: {
        name: "codex",
        status: "verified",
        readsAgentsMd: true,
        walkBoundary: "git-root",
        conventionFiles: ["AGENTS.md", "AGENTS.override.md"],
        conventionDirs: [".codex/", ".agents/skills/", ".codex-plugin/"],
        primaryIndicators: [
            "AGENTS.override.md",
            ".codex/",
            ".agents/skills/",
            ".codex-plugin/",
        ],
        crossRefMechanisms: [
            {
                edgeType: "soft-reference",
                description:
                    "Frontmatter see:/references:/requires: keys or markdown links to sibling instruction files",
            },
        ],
    },

    antigravity: {
        name: "antigravity",
        status: "needs-verification",
        readsAgentsMd: false,
        walkBoundary: null,
        conventionFiles: ["GEMINI.md"],
        conventionDirs: [".gemini/"],
        primaryIndicators: ["GEMINI.md", ".gemini/"],
        crossRefMechanisms: [
            {
                edgeType: "soft-reference",
                description:
                    "Frontmatter see:/references:/requires: keys or markdown links to sibling instruction files",
            },
        ],
    },

    hermes: {
        name: "hermes",
        status: "verified",
        readsAgentsMd: true,
        walkBoundary: "git-root",
        conventionFiles: [
            ".hermes.md",
            "HERMES.md",
            "AGENTS.md",
            "agents.md",
            "CLAUDE.md",
            "claude.md",
            ".cursorrules",
            "SOUL.md",
        ],
        conventionDirs: [],
        primaryIndicators: [".hermes.md", "HERMES.md", "SOUL.md"],
        crossRefMechanisms: [
            {
                edgeType: "soft-reference",
                description:
                    "Frontmatter see:/references:/requires: keys or markdown links to sibling instruction files",
            },
        ],
    },

    crush: {
        name: "crush",
        status: "verified",
        readsAgentsMd: true,
        walkBoundary: null,
        conventionFiles: ["AGENTS.md", "crush.json"],
        conventionDirs: [".crush/", ".agents/skills/"],
        primaryIndicators: ["crush.json", ".crush/"],
        crossRefMechanisms: [
            {
                edgeType: "soft-reference",
                description:
                    "Frontmatter see:/references:/requires: keys or markdown links to sibling instruction files",
            },
        ],
    },

    pi: {
        name: "pi",
        status: "verified",
        readsAgentsMd: true,
        walkBoundary: "filesystem-root",
        conventionFiles: ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"],
        conventionDirs: [".pi/", ".pi/skills/", ".pi/prompts/"],
        primaryIndicators: [".pi/", ".pi/skills/", ".pi/prompts/"],
        crossRefMechanisms: [
            {
                edgeType: "soft-reference",
                description:
                    "Frontmatter see:/references:/requires: keys or markdown links to sibling instruction files",
            },
        ],
    },

    shared: {
        name: "shared",
        status: "verified",
        readsAgentsMd: true,
        walkBoundary: null,
        conventionFiles: ["AGENTS.md", "AGENTS.MD", "agents.md"],
        conventionDirs: [],
        primaryIndicators: ["AGENTS.md", "AGENTS.MD", "agents.md"],
        crossRefMechanisms: [],
    },
};

export function getFootprint(harness: HarnessName): HarnessFootprint {
    return HARNESS_FOOTPRINTS[harness];
}

export function matchesPrimaryIndicator(
    repoRelativePath: string,
    indicators: readonly string[],
): boolean {
    const normalized = repoRelativePath.replace(/\\/g, "/");
    return indicators.some((indicator) => {
        if (indicator.endsWith("/")) {
            return (
                normalized === indicator.slice(0, -1) ||
                normalized.startsWith(indicator)
            );
        }
        return normalized === indicator;
    });
}
