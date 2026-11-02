import { describe, expect, it } from "vitest";
import {
    importLimitFindings,
    skippedSymlinkFindings,
    unreadFileFindings,
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

describe("unreadFileFindings", () => {
    it("should report nothing when the scan read every file it needed", () => {
        expect(unreadFileFindings([])).toEqual([]);
    });

    it("should report one advisory that names the files and what is missing from the report", () => {
        const findings = unreadFileFindings(["CLAUDE.md", "docs/AGENTS.md"]);

        expect(findings).toEqual([
            {
                id: "instruction-file-unread:all:repository",
                criterionId: "instruction-file-unread",
                targetId: "all:repository",
                severity: "medium",
                category: "governance",
                classification: "advisory",
                intentGated: false,
                assumedIntent: false,
                description:
                    "The repository scan could not read 2 harness file(s) (a file with more than one hard link, a file over 1 MiB, or one the system would not open), so their @ imports and links are not in this report: CLAUDE.md, docs/AGENTS.md.",
            },
        ]);
    });

    it("should name the first five files and count the rest", () => {
        const paths = Array.from({ length: 7 }, (_, index) => `f${index}.md`);

        const [finding] = unreadFileFindings(paths);

        expect(finding?.description).toContain(
            "f0.md, f1.md, f2.md, f3.md, f4.md, and 2 more.",
        );
    });
});
