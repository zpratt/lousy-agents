import { describe, expect, it } from "vitest";
import {
    AGENTIC_LOCATION_CATALOG,
    type AgenticLocationEntry,
    type LintDiscoveryTarget,
} from "../entities/agentic-location-catalog.js";
import { LINT_RELEVANT_PATH_CONTRACT } from "./agentic-lint-path-contract.js";
import {
    lintTargetEntries,
    primaryConstructTypeForPath,
} from "./agentic-location-matchers.js";

/**
 * Intentional exceptions (not parity failures):
 * - skills-lock.json: lint-only filter
 * - PreToolUse/preToolUse heuristic: lint-only
 * - symlink: lint skip / doctor follow
 * - doctor-only constructs: mcp-server, plugin, subagent, claude commands, pi skills, etc.
 * - lessons: lint subcommand only
 */
const INTENTIONAL_EXCEPTIONS = [
    "skills-lock.json",
    "PreToolUse/preToolUse heuristic",
    "symlink policy",
    "doctor-only constructs",
    "lessons",
] as const;

const LINT_MAPPED_TARGETS: ReadonlyArray<Exclude<LintDiscoveryTarget, "none">> =
    ["skills", "agents", "hooks", "instructions"];

const DOCTOR_ONLY_ENTRY_IDS = [
    "skill-pi",
    "skill-pi-prompts",
    "hook-github-dir",
    "hook-claude-dir",
    "subagent-claude",
    "agent-claude-commands",
    "plugin-codex",
] as const;

function samplePathForEntry(entry: AgenticLocationEntry): string {
    if (entry.matchKind === "exact") {
        return entry.path;
    }
    switch (entry.primaryConstruct) {
        case "skill":
            return `${entry.path}/example/SKILL.md`;
        case "agent":
        case "subagent":
            return `${entry.path}/example.md`;
        case "hook":
            return `${entry.path}/example.json`;
        case "instruction":
            return `${entry.path}/example.instructions.md`;
        case "plugin":
            return `${entry.path}/manifest.json`;
        case "mcp-server":
            return `${entry.path}/config.json`;
        default: {
            const _exhaustive: never = entry.primaryConstruct;
            return `${entry.path}/example`;
        }
    }
}

/**
 * Pure catalog-internal parity: every lint-mapped entry's sample path must
 * resolve to that entry's primaryConstruct via the matcher.
 */
function findCatalogInternalParityIssues(
    catalog: readonly AgenticLocationEntry[],
): readonly string[] {
    const issues: string[] = [];
    for (const entry of catalog) {
        if (entry.lintTarget === "none") {
            continue;
        }
        const sample = samplePathForEntry(entry);
        const resolved = primaryConstructTypeForPath(sample, catalog);
        if (resolved !== entry.primaryConstruct) {
            issues.push(
                `Entry "${entry.id}" sample "${sample}" resolved ${String(resolved)} (expected ${entry.primaryConstruct})`,
            );
        }
    }
    return issues;
}

describe("agentic location catalog internal parity", () => {
    describe("when documenting intentional exceptions", () => {
        it("should list policy differences that are not catalog drift", () => {
            expect(INTENTIONAL_EXCEPTIONS.length).toBeGreaterThan(0);
            expect(INTENTIONAL_EXCEPTIONS).toContain("doctor-only constructs");
            expect(INTENTIONAL_EXCEPTIONS).toContain("skills-lock.json");
        });
    });

    describe("when lint-mapped entries are present", () => {
        it("should resolve each lint-mapped sample path to the entry primaryConstruct", () => {
            // Arrange
            const lintMapped = AGENTIC_LOCATION_CATALOG.filter((entry) =>
                LINT_MAPPED_TARGETS.includes(
                    entry.lintTarget as Exclude<LintDiscoveryTarget, "none">,
                ),
            );

            // Act
            const issues = findCatalogInternalParityIssues(
                AGENTIC_LOCATION_CATALOG,
            );

            // Assert
            expect(lintMapped.length).toBeGreaterThan(0);
            expect(issues).toEqual([]);
        });

        it("should satisfy the frozen lint-relevant path contract", () => {
            // Arrange / Act / Assert — independent of catalog entry ids
            for (const expectation of LINT_RELEVANT_PATH_CONTRACT) {
                expect(primaryConstructTypeForPath(expectation.path)).toBe(
                    expectation.construct,
                );
            }
        });

        it("should keep dual-role agents primary construct as agent", () => {
            // Arrange
            const agents = lintTargetEntries("agents");

            // Act / Assert
            for (const entry of agents) {
                expect(entry.primaryConstruct).toBe("agent");
                expect(
                    primaryConstructTypeForPath(samplePathForEntry(entry)),
                ).toBe("agent");
            }
        });
    });

    describe("when doctor-only entries are present", () => {
        it("should mark doctor-only locations with lintTarget none and known ids", () => {
            // Arrange
            const doctorOnly = AGENTIC_LOCATION_CATALOG.filter(
                (entry) => entry.lintTarget === "none",
            );

            // Act / Assert
            expect(doctorOnly.length).toBeGreaterThan(0);
            for (const entry of doctorOnly) {
                expect(DOCTOR_ONLY_ENTRY_IDS).toContain(entry.id);
            }
            // Doctor-only changes must not imply new lint validators (AC4)
            expect(
                doctorOnly.every((entry) => entry.lintTarget === "none"),
            ).toBe(true);
        });
    });

    describe("when findCatalogInternalParityIssues is given mismatched fixtures", () => {
        it("should report an issue when declared construct disagrees with matcher resolution", () => {
            // Arrange — more-specific prefix steals the skill-root sample path
            const mismatched: AgenticLocationEntry[] = [
                {
                    id: "skill-root",
                    path: ".github/skills",
                    matchKind: "directory-prefix",
                    primaryConstruct: "skill",
                    lintTarget: "skills",
                },
                {
                    id: "hijack",
                    path: ".github/skills/example",
                    matchKind: "directory-prefix",
                    primaryConstruct: "hook",
                    lintTarget: "none",
                },
            ];

            // Act
            const issues = findCatalogInternalParityIssues(mismatched);

            // Assert — proves the parity helper fails on drift (red evidence)
            expect(issues.length).toBeGreaterThan(0);
            expect(issues.some((msg) => msg.includes("skill-root"))).toBe(true);
        });
    });
});
