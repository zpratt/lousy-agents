import Chance from "chance";
import { describe, expect, it } from "vitest";
import { externalImportMessage } from "./external-import-message.js";

const chance = new Chance();

describe("externalImportMessage", () => {
    describe("when the import resolves outside the working directory by path", () => {
        it("should use the approved wording and say it was not loaded in headless testing", () => {
            const path = `/${chance.word()}/${chance.word()}.md`;

            const message = externalImportMessage(
                path,
                "outside-working-directory",
            );

            expect(message).toBe(
                `External import: \`${path}\` resolves outside the working directory. Claude Code loads it only after a one-time approval in an interactive session (docs: memory, 'Import additional files'). In headless, \`-p\` or CI runs it was not loaded in testing (Claude Code 2.1.316). Move the file into the repo, or import it from ~/.claude/CLAUDE.md instead.`,
            );
        });
    });

    describe("when the import is a ~/ path", () => {
        it("should say the case is docs-based and was not observed, not that it was tested", () => {
            const path = `~/${chance.word()}.md`;

            const message = externalImportMessage(path, "home");

            expect(message).toContain(
                `External import: \`${path}\` resolves outside the working directory.`,
            );
            expect(message).toContain("docs-based");
            expect(message).toContain("not observed in testing");
            expect(message).not.toContain("was not loaded in testing");
            expect(message).toContain(
                "import it from ~/.claude/CLAUDE.md instead.",
            );
        });
    });
});
