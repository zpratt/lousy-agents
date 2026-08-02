import {
    AGENTIC_LOCATION_CATALOG,
    type AgenticLocationEntry,
    type LintDiscoveryTarget,
} from "@lousy-agents/core/entities/agentic-location-catalog.js";
import {
    LINT_RELEVANT_PATH_CONTRACT,
    type LintRelevantPathExpectation,
} from "@lousy-agents/core/lib/agentic-lint-path-contract.js";
import { primaryConstructTypeForPath } from "@lousy-agents/core/lib/agentic-location-matchers.js";
import { describe, expect, it } from "vitest";
import {
    HARNESS_FOOTPRINTS,
    matchesPrimaryIndicator,
} from "./harness-footprints.js";

/**
 * Intentional exceptions (not parity failures):
 * - skills-lock.json: lint-only filter
 * - PreToolUse/preToolUse heuristic: lint-only
 * - symlink: lint skip / doctor follow
 * - doctor-only constructs: mcp-server, plugin, claude commands, etc.
 * - lessons: lint subcommand only
 */
const INTENTIONAL_EXCEPTIONS = [
    "skills-lock.json",
    "PreToolUse/preToolUse heuristic",
    "symlink policy",
    "doctor-only constructs",
    "lessons",
] as const;

const LINT_MAPPED_TARGETS: ReadonlySet<Exclude<LintDiscoveryTarget, "none">> =
    new Set(["skills", "agents", "subagents", "hooks", "instructions"]);

/**
 * Catalog entries doctor owns exclusively. Lint validators are not required
 * for these — doctor-only location changes must keep parity green (AC4).
 */
const DOCTOR_ONLY_ENTRY_IDS = [
    "hook-github-dir",
    "hook-claude-dir",
    "agent-claude-commands",
    "plugin-codex",
] as const;

type ParityFootprintMap = Readonly<
    Record<string, { readonly primaryIndicators: readonly string[] }>
>;

type ParityIssue = {
    readonly kind:
        | "missing-construct"
        | "missing-harness-coverage"
        | "missing-catalog-prefix"
        | "missing-contract-harness"
        | "unexpected-doctor-only"
        | "doctor-only-has-lint-target";
    readonly message: string;
    readonly entryId?: string;
};

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

function isCoveredByAnyFootprint(
    path: string,
    footprints: ParityFootprintMap,
): boolean {
    return Object.values(footprints).some((footprint) =>
        matchesPrimaryIndicator(path, footprint.primaryIndicators),
    );
}

function isCoveredByHintedFootprint(
    entry: AgenticLocationEntry,
    path: string,
    footprints: ParityFootprintMap,
): boolean {
    const hints = entry.harnessHints ?? [];
    return hints.some((hint) => {
        const footprint = footprints[hint];
        if (!footprint) {
            return false;
        }
        return matchesPrimaryIndicator(path, footprint.primaryIndicators);
    });
}

/**
 * Pure parity checker: lint-mapped catalog entries must have construct typing
 * and harness indicator coverage; reverse prefixes must appear in the catalog.
 * Doctor-only entries are exempt from lint validator requirements.
 */
function findCatalogDoctorParityIssues(
    catalog: readonly AgenticLocationEntry[],
    footprints: ParityFootprintMap,
    options: {
        readonly doctorOnlyIds?: readonly string[];
        readonly pathContract?: readonly LintRelevantPathExpectation[];
    } = {},
): readonly ParityIssue[] {
    const doctorOnlyIds = new Set(
        options.doctorOnlyIds ?? DOCTOR_ONLY_ENTRY_IDS,
    );
    const pathContract = options.pathContract ?? LINT_RELEVANT_PATH_CONTRACT;
    const issues: ParityIssue[] = [];

    for (const entry of catalog) {
        if (entry.lintTarget === "none") {
            if (!doctorOnlyIds.has(entry.id)) {
                issues.push({
                    kind: "unexpected-doctor-only",
                    entryId: entry.id,
                    message: `Catalog entry "${entry.id}" has lintTarget "none" but is not listed in doctor-only exceptions`,
                });
            }
            continue;
        }

        if (!LINT_MAPPED_TARGETS.has(entry.lintTarget)) {
            continue;
        }

        if (doctorOnlyIds.has(entry.id)) {
            issues.push({
                kind: "doctor-only-has-lint-target",
                entryId: entry.id,
                message: `Catalog entry "${entry.id}" is listed as doctor-only but has lintTarget "${entry.lintTarget}"`,
            });
        }

        const sample = samplePathForEntry(entry);
        const construct = primaryConstructTypeForPath(sample, catalog);
        if (construct !== entry.primaryConstruct) {
            issues.push({
                kind: "missing-construct",
                entryId: entry.id,
                message: `Lint-mapped entry "${entry.id}" sample "${sample}" resolved construct ${String(construct)} (expected ${entry.primaryConstruct})`,
            });
        }

        const covered =
            isCoveredByAnyFootprint(sample, footprints) ||
            isCoveredByHintedFootprint(entry, sample, footprints);
        if (!covered) {
            issues.push({
                kind: "missing-harness-coverage",
                entryId: entry.id,
                message: `Lint-mapped entry "${entry.id}" sample "${sample}" is not covered by any harness primaryIndicators`,
            });
        }
    }

    // Frozen contract: independent of catalog entry ids — reverse AC2 without a
    // third parallel path list that can drift from the catalog unnoticed.
    for (const expectation of pathContract) {
        const resolved = primaryConstructTypeForPath(expectation.path, catalog);
        if (resolved !== expectation.construct) {
            issues.push({
                kind: "missing-catalog-prefix",
                message: `Frozen lint path contract "${expectation.path}" resolved construct ${String(resolved)} (expected ${expectation.construct})`,
            });
        }
        if (!isCoveredByAnyFootprint(expectation.path, footprints)) {
            issues.push({
                kind: "missing-contract-harness",
                message: `Frozen lint path contract "${expectation.path}" is not covered by any harness primaryIndicators`,
            });
        }
    }

    return issues;
}

function assertCatalogDoctorParity(
    catalog: readonly AgenticLocationEntry[],
    footprints: ParityFootprintMap,
    options?: Parameters<typeof findCatalogDoctorParityIssues>[2],
): void {
    const issues = findCatalogDoctorParityIssues(catalog, footprints, options);
    if (issues.length > 0) {
        throw new Error(
            `Catalog↔doctor parity drift:\n${issues.map((i) => `- ${i.message}`).join("\n")}`,
        );
    }
}

describe("catalog↔doctor parity", () => {
    describe("when checking intentional exceptions registry", () => {
        it("should document known non-parity policy differences", () => {
            // Arrange / Assert — keep the exception list visible next to assertions
            expect(INTENTIONAL_EXCEPTIONS).toEqual(
                expect.arrayContaining([
                    "skills-lock.json",
                    "PreToolUse/preToolUse heuristic",
                    "symlink policy",
                    "doctor-only constructs",
                    "lessons",
                ]),
            );
        });
    });

    describe("when lint-mapped catalog locations exist", () => {
        it("should resolve primary construct and harness indicators for every lint-mapped entry", () => {
            // Arrange
            const lintMapped = AGENTIC_LOCATION_CATALOG.filter((entry) =>
                LINT_MAPPED_TARGETS.has(
                    entry.lintTarget as Exclude<LintDiscoveryTarget, "none">,
                ),
            );

            // Act / Assert
            expect(lintMapped.length).toBeGreaterThan(0);
            for (const entry of lintMapped) {
                const sample = samplePathForEntry(entry);
                expect(primaryConstructTypeForPath(sample)).toBe(
                    entry.primaryConstruct,
                );
                const covered =
                    isCoveredByAnyFootprint(sample, HARNESS_FOOTPRINTS) ||
                    isCoveredByHintedFootprint(
                        entry,
                        sample,
                        HARNESS_FOOTPRINTS,
                    );
                expect(covered).toBe(true);
            }
        });

        it("should keep dual-role .github/agents primary construct as agent", () => {
            // Arrange
            const sample = ".github/agents/reviewer.md";

            // Act
            const construct = primaryConstructTypeForPath(sample);

            // Assert
            expect(construct).toBe("agent");
        });

        it("should match .github/skills samples to copilot indicators and skill construct", () => {
            // Arrange
            const sample = ".github/skills/x/SKILL.md";

            // Act
            const construct = primaryConstructTypeForPath(sample);
            const copilotMatch = matchesPrimaryIndicator(
                sample,
                HARNESS_FOOTPRINTS.copilot.primaryIndicators,
            );

            // Assert
            expect(construct).toBe("skill");
            expect(copilotMatch).toBe(true);
        });
    });

    describe("when doctor-only catalog entries exist", () => {
        it("should list doctor-only entries as intentional exceptions without requiring lint validators", () => {
            // Arrange
            const doctorOnly = AGENTIC_LOCATION_CATALOG.filter(
                (entry) => entry.lintTarget === "none",
            );

            // Act / Assert
            for (const entry of doctorOnly) {
                expect(DOCTOR_ONLY_ENTRY_IDS).toContain(entry.id);
                expect(entry.lintTarget).toBe("none");
            }
            // AC4: adding/changing doctor-only locations does not demand lint validators
            expect(
                doctorOnly.every((entry) => entry.lintTarget === "none"),
            ).toBe(true);
        });
    });

    describe("when checking the frozen lint path contract against catalog and footprints", () => {
        it("should type and harness-cover every contracted path", () => {
            // Arrange / Act / Assert
            for (const expectation of LINT_RELEVANT_PATH_CONTRACT) {
                expect(primaryConstructTypeForPath(expectation.path)).toBe(
                    expectation.construct,
                );
                expect(
                    isCoveredByAnyFootprint(
                        expectation.path,
                        HARNESS_FOOTPRINTS,
                    ),
                ).toBe(true);
            }
        });
    });

    describe("when running the full parity assertion against live catalog and footprints", () => {
        it("should report no parity issues", () => {
            // Act / Assert
            expect(() =>
                assertCatalogDoctorParity(
                    AGENTIC_LOCATION_CATALOG,
                    HARNESS_FOOTPRINTS,
                ),
            ).not.toThrow();
        });
    });

    describe("when assertCatalogDoctorParity is given deliberately broken inputs", () => {
        it("should fail when a lint-mapped catalog path lacks harness indicator coverage", () => {
            // Arrange — empty indicators prove the helper catches drift (red evidence)
            const brokenFootprints: ParityFootprintMap = {
                copilot: { primaryIndicators: [] },
                claude: { primaryIndicators: [] },
                shared: { primaryIndicators: [] },
            };
            const lintOnlyCatalog: AgenticLocationEntry[] = [
                {
                    id: "skill-github",
                    path: ".github/skills",
                    matchKind: "directory-prefix",
                    primaryConstruct: "skill",
                    lintTarget: "skills",
                    harnessHints: ["copilot"],
                },
            ];

            // Act
            const issues = findCatalogDoctorParityIssues(
                lintOnlyCatalog,
                brokenFootprints,
                { doctorOnlyIds: [], pathContract: [] },
            );

            // Assert
            expect(
                issues.some((i) => i.kind === "missing-harness-coverage"),
            ).toBe(true);
            expect(() =>
                assertCatalogDoctorParity(lintOnlyCatalog, brokenFootprints, {
                    doctorOnlyIds: [],
                    pathContract: [],
                }),
            ).toThrow(/parity drift/i);
        });

        it("should fail when the frozen path contract is missing from the catalog", () => {
            // Arrange
            const emptyCatalog: AgenticLocationEntry[] = [];

            // Act
            const issues = findCatalogDoctorParityIssues(
                emptyCatalog,
                HARNESS_FOOTPRINTS,
                {
                    doctorOnlyIds: [],
                    pathContract: [
                        {
                            path: ".github/skills/example/SKILL.md",
                            construct: "skill",
                        },
                    ],
                },
            );

            // Assert
            expect(
                issues.some((i) => i.kind === "missing-catalog-prefix"),
            ).toBe(true);
        });

        it("should fail when a contracted path lacks harness indicator coverage", () => {
            // Arrange
            const catalogWithSkill: AgenticLocationEntry[] = [
                {
                    id: "skill-github",
                    path: ".github/skills",
                    matchKind: "directory-prefix",
                    primaryConstruct: "skill",
                    lintTarget: "skills",
                    harnessHints: ["copilot"],
                },
            ];

            // Act
            const issues = findCatalogDoctorParityIssues(
                catalogWithSkill,
                { copilot: { primaryIndicators: [] } },
                {
                    doctorOnlyIds: [],
                    pathContract: [
                        {
                            path: ".github/skills/example/SKILL.md",
                            construct: "skill",
                        },
                    ],
                },
            );

            // Assert
            expect(
                issues.some((i) => i.kind === "missing-contract-harness"),
            ).toBe(true);
        });

        it("should fail when construct typing drifts from the catalog entry", () => {
            // Arrange — more-specific prefix steals the skill-root sample path
            const competing: AgenticLocationEntry[] = [
                {
                    id: "skill-root",
                    path: ".github/skills",
                    matchKind: "directory-prefix",
                    primaryConstruct: "skill",
                    lintTarget: "skills",
                    harnessHints: ["copilot"],
                },
                {
                    id: "hijack",
                    path: ".github/skills/example",
                    matchKind: "directory-prefix",
                    primaryConstruct: "hook",
                    lintTarget: "none",
                    harnessHints: ["copilot"],
                },
            ];

            // Act
            const issues = findCatalogDoctorParityIssues(
                competing,
                {
                    copilot: {
                        primaryIndicators: [".github/skills/", ".github/"],
                    },
                },
                {
                    doctorOnlyIds: ["hijack"],
                    pathContract: [],
                },
            );

            // Assert
            expect(issues.some((i) => i.kind === "missing-construct")).toBe(
                true,
            );
        });
    });
});
