import { describe, expect, it } from "vitest";
import {
    importLimitFindings,
    skippedSymlinkFindings,
} from "./scan-notice-findings.js";

describe("skippedSymlinkFindings", () => {
    it("should report nothing when the scan skipped no symbolic link", () => {
        expect(skippedSymlinkFindings([])).toEqual([]);
    });

    it("should report one advisory that names the skipped links and what it means for the report", () => {
        const findings = skippedSymlinkFindings(["docs/leak.md", "a.json"]);

        expect(findings).toEqual([
            {
                id: "discovery-symlink-skipped:all:repository",
                criterionId: "discovery-symlink-skipped",
                targetId: "all:repository",
                severity: "medium",
                category: "governance",
                classification: "advisory",
                intentGated: false,
                assumedIntent: false,
                description:
                    "The repository scan skipped 2 symbolic link(s) that point outside the repository, so their targets are not in this report: docs/leak.md, a.json. Replace a link with a file inside the repository to have it scanned.",
            },
        ]);
    });

    it("should name the first five links and count the rest", () => {
        const paths = Array.from({ length: 7 }, (_, index) => `l${index}.md`);

        const [finding] = skippedSymlinkFindings(paths);

        expect(finding?.description).toContain(
            "skipped 7 symbolic link(s) that point outside the repository, so their targets are not in this report: l0.md, l1.md, l2.md, l3.md, l4.md, and 2 more.",
        );
    });
});

describe("importLimitFindings", () => {
    it("should report nothing when no file went over the limit", () => {
        expect(importLimitFindings(undefined)).toEqual([]);
    });

    it("should report one advisory that names the limit and the files that went over it", () => {
        const findings = importLimitFindings({
            maxImports: 256,
            files: ["CLAUDE.md", ".claude/CLAUDE.md"],
        });

        expect(findings).toEqual([
            {
                id: "import-limit-reached:all:repository",
                criterionId: "import-limit-reached",
                targetId: "all:repository",
                severity: "medium",
                category: "governance",
                classification: "advisory",
                intentGated: false,
                assumedIntent: false,
                description:
                    "The repository scan checked only the first 256 @ imports of 2 file(s), so imports after them are not in this report: CLAUDE.md, .claude/CLAUDE.md.",
            },
        ]);
    });
});
