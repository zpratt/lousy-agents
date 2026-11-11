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
    /**
     * Whether the harness reads AGENTS.md. Some harnesses do so only under a
     * condition; the footprint's own comment says which. Nothing in doctor
     * branches on this yet, so it records what each harness does and changes
     * no finding.
     */
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
        // Claude Code reads AGENTS.md only when no CLAUDE.md,
        // .claude/CLAUDE.md or CLAUDE.local.md exists in the working directory
        // or above it, under the default `claude-md-or-agents-md` setting, and
        // only on Claude Code 2.1.277 or later (Claude Code docs: memory). A
        // CLAUDE.md can always include it explicitly with `@AGENTS.md`.
        readsAgentsMd: true,
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
        // Copilot reads AGENTS.md (GitHub docs: custom instructions support).
        readsAgentsMd: true,
        walkBoundary: "project",
        conventionFiles: [".github/copilot-instructions.md"],
        conventionDirs: [".github/instructions/"],
        rootOnlyConventionFiles: ["CLAUDE.md", "GEMINI.md"],
        primaryIndicators: [
            ".github/copilot-instructions.md",
            ".github/instructions/",
            ".github/skills/",
            ".github/agents/",
            ".github/hooks/",
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

const ALL_HARNESS_NAMES: readonly HarnessName[] = [...HARNESS_NAMES, "shared"];

/**
 * Instruction filenames a harness loads in subdirectories as well as at the
 * repository root. Other bare primary indicators stay exact root paths.
 * Case-sensitive, matching the indicator spellings.
 */
const NESTED_INSTRUCTION_FILENAMES: ReadonlySet<string> = new Set([
    "CLAUDE.md",
    "AGENTS.md",
    "AGENTS.MD",
    "agents.md",
]);

function soleHarness(matches: readonly HarnessName[]): HarnessName | null {
    if (matches.length >= 2) {
        return "shared";
    }
    return matches[0] ?? null;
}

function harnessesMatching(
    path: string,
    footprints: Readonly<Record<HarnessName, HarnessFootprint>>,
    matches: (path: string, indicators: readonly string[]) => boolean,
): HarnessName[] {
    return ALL_HARNESS_NAMES.filter((harness) =>
        matches(path, footprints[harness].primaryIndicators),
    );
}

/**
 * True when `normalized` is a nested instruction file whose filename is one
 * of this harness's primary indicators. Root files are exact indicators and
 * are not matched here.
 */
function matchesNestedInstructionFilename(
    normalized: string,
    indicators: readonly string[],
): boolean {
    const slash = normalized.lastIndexOf("/");
    if (slash === -1) {
        return false;
    }
    const name = normalized.slice(slash + 1);
    return NESTED_INSTRUCTION_FILENAMES.has(name) && indicators.includes(name);
}

/**
 * Resolves which harness owns a repo-relative path from the harnesses'
 * primary indicators. A path claimed by more than one harness is shared; a
 * path claimed by none belongs to no harness.
 *
 * `CLAUDE.md` and `AGENTS.md` (and the `AGENTS.MD` and `agents.md` spellings)
 * are also recognized in subdirectories when no indicator already claims the
 * path, so a copy inside a directory another harness owns keeps that harness.
 */
export function determineHarness(
    repoRelativePath: string,
    footprints: Readonly<
        Record<HarnessName, HarnessFootprint>
    > = HARNESS_FOOTPRINTS,
): HarnessName | null {
    const normalized = repoRelativePath.replaceAll("\\", "/");
    const claimed = soleHarness(
        harnessesMatching(normalized, footprints, matchesPrimaryIndicator),
    );
    if (claimed !== null) {
        return claimed;
    }
    return soleHarness(
        harnessesMatching(
            normalized,
            footprints,
            matchesNestedInstructionFilename,
        ),
    );
}
