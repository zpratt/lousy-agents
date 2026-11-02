import type { LintDiagnostic } from "@lousy-agents/lint";
import { describe, expect, it } from "vitest";
import { summarySection } from "./summary-markdown.js";

const LIMIT_MESSAGE =
    "Discovery stopped after 10000 directories.\nSecond line.";

function limitDiagnostic(): LintDiagnostic {
    return {
        filePath: "/repo",
        line: 1,
        severity: "warning",
        message: LIMIT_MESSAGE,
        ruleId: "instruction/discovery-limit-reached",
        target: "instruction",
    };
}

describe("summarySection", () => {
    const WarningSign = String.fromCodePoint(0x26a0, 0xfe0f);
    const Heading = "\n### lousy-agents lint: run-level warnings\n\n";

    it("should write one bullet per diagnostic, in order, under the heading", () => {
        const second: LintDiagnostic = {
            ...limitDiagnostic(),
            ruleId: "instruction/other-rule",
            message: "Another warning.",
        };

        const content = summarySection([limitDiagnostic(), second]);

        expect(content).toBe(
            `${Heading}- ${WarningSign} \`instruction/discovery-limit-reached\`: Discovery stopped after 10000 directories. Second line.\n- ${WarningSign} \`instruction/other-rule\`: Another warning.\n`,
        );
    });

    it("should keep each bullet on one line whatever kind of line break the message holds", () => {
        const content = summarySection([
            {
                ...limitDiagnostic(),
                message: "first\rsecond\r\nthird\nfourth",
            },
        ]);

        expect(content).toBe(
            `${Heading}- ${WarningSign} \`instruction/discovery-limit-reached\`: first second third fourth\n`,
        );
    });

    it.each([
        [
            "a link written into a symlink's name",
            ".github/instructions/[Approve fix](https:/evil.example/a).instructions.md",
            ".github/instructions/\\[Approve fix\\]\\(https:/evil.example/a\\).instructions.md",
        ],
        [
            "a backtick, a table pipe and an image tag",
            "` | <img src=x> x.instructions.md",
            "\\` \\| \\<img src=x\\> x.instructions.md",
        ],
        [
            "a backslash that would swallow the escape before a bracket",
            "dir\\[x].instructions.md",
            "dir\\\\\\[x\\].instructions.md",
        ],
        [
            "emphasis and strikethrough markers",
            "*bold* _under_ ~~gone~~",
            "\\*bold\\* \\_under\\_ \\~\\~gone\\~\\~",
        ],
        [
            "a bare URL that would become a link",
            "https://evil.example/a",
            "https\\://evil.example/a",
        ],
        [
            "a www address that would become a link",
            "www.evil.example/a",
            "www\\.evil.example/a",
        ],
        [
            "an email address that would become a link",
            "a@evil.example",
            "a\\@evil.example",
        ],
        [
            "an upper case WWW address, which some renderers still link",
            "WWW.evil.example",
            "WWW\\.evil.example",
        ],
        [
            "a mixed case Www address",
            "see Www.evil.example and wWw.evil.example",
            "see Www\\.evil.example and wWw\\.evil.example",
        ],
        [
            "a www address after an underscore, which GFM still links",
            "_www.evil.example",
            "\\_www\\.evil.example",
        ],
        [
            "a www address after an asterisk",
            "*www.evil.example",
            "\\*www\\.evil.example",
        ],
        [
            "a www address after a tilde",
            "~www.evil.example",
            "\\~www\\.evil.example",
        ],
        [
            "a www address in parentheses",
            "(www.evil.example)",
            "\\(www\\.evil.example\\)",
        ],
        [
            "a www address after a hyphen",
            "-www.evil.example",
            "-www\\.evil.example",
        ],
        [
            "a www address after a space",
            "see www.evil.example",
            "see www\\.evil.example",
        ],
        [
            "a www address inside a word, where the escape costs nothing",
            "awww.evil.example",
            "awww\\.evil.example",
        ],
        [
            "a URL scheme after an underscore",
            "_https://evil.example",
            "\\_https\\://evil.example",
        ],
        [
            "an email address after an underscore",
            "_a@evil.example",
            "\\_a\\@evil.example",
        ],
        ["a hash that GitHub links as an issue reference", "#1", "\\#1"],
        [
            "a hash after a repository name",
            "see owner/repo#1",
            "see owner/repo\\#1",
        ],
        [
            "a hash that opens a heading at the start of a message",
            "# heading",
            "\\# heading",
        ],
        [
            "an HTML entity, which must stay literal",
            "&lt;img&gt; and &#35;",
            "\\&lt;img\\&gt; and \\&\\#35;",
        ],
        [
            "dollar signs that could open a math expression",
            "$x$ and $$y$$",
            "\\$x\\$ and \\$\\$y\\$\\$",
        ],
    ])(
        "should write %s as literal text, so a path in a message cannot render as markup",
        (_name, message, escaped) => {
            const content = summarySection([{ ...limitDiagnostic(), message }]);

            expect(content).toBe(
                `${Heading}- ${WarningSign} \`instruction/discovery-limit-reached\`: ${escaped}\n`,
            );
        },
    );

    it("should leave neither a link opener nor a raw image tag from the hostile names in the review", () => {
        const content = summarySection([
            {
                ...limitDiagnostic(),
                message:
                    ".github/instructions/[Approve fix](https:/evil.example/a).instructions.md, ` | <img src=x> x.instructions.md",
            },
        ]);

        expect(content).not.toContain("](");
        expect(content).not.toMatch(/(?<!\\)<img/);
        expect(content).toBe(
            `${Heading}- ${WarningSign} \`instruction/discovery-limit-reached\`: .github/instructions/\\[Approve fix\\]\\(https:/evil.example/a\\).instructions.md, \\\` \\| \\<img src=x\\> x.instructions.md\n`,
        );
    });

    it("should leave ordinary prose unchanged, so a readable message stays readable", () => {
        const message =
            "Skipped 2 symbolic links, so targets were not analyzed: CLAUDE.md, AGENTS.md. Replace a link to have it analyzed.";

        const content = summarySection([{ ...limitDiagnostic(), message }]);

        expect(content).toBe(
            `${Heading}- ${WarningSign} \`instruction/discovery-limit-reached\`: ${message}\n`,
        );
    });

    it("should label a diagnostic that has no rule id with the tool name", () => {
        const { ruleId: _ruleId, ...withoutRuleId } = limitDiagnostic();

        const content = summarySection([
            { ...withoutRuleId, message: "Plain." },
        ]);

        expect(content).toBe(
            `${Heading}- ${WarningSign} \`lousy-agents\`: Plain.\n`,
        );
    });
});
