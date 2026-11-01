import Chance from "chance";
import { describe, expect, it } from "vitest";
import { formatWorkflowCommand } from "./workflow-commands.js";

const chance = new Chance();

describe("formatWorkflowCommand", () => {
    describe("when the diagnostic is a warning with a rule id", () => {
        it("should produce a ::warning command titled with the rule id", () => {
            const message = chance.sentence();

            const command = formatWorkflowCommand({
                severity: "warning",
                ruleId: "instruction/discovery-limit-reached",
                message,
            });

            expect(command).toBe(
                `::warning title=instruction/discovery-limit-reached::${message}`,
            );
        });
    });

    describe("when the severity differs", () => {
        it.each([
            ["error", "::error"],
            ["warning", "::warning"],
            ["info", "::notice"],
        ] as const)("should map %s to %s", (severity, expected) => {
            const command = formatWorkflowCommand({
                severity,
                ruleId: "rule/x",
                message: "m",
            });

            expect(command.startsWith(`${expected} `)).toBe(true);
        });
    });

    describe("when the message contains characters the runner treats specially", () => {
        it("should escape percent signs and line breaks so the command cannot be split", () => {
            const command = formatWorkflowCommand({
                severity: "warning",
                ruleId: "rule/x",
                message: "100% done\r\nnext::warning::injected",
            });

            expect(command).toBe(
                "::warning title=rule/x::100%25 done%0D%0Anext::warning::injected",
            );
            expect(command.split("\n")).toHaveLength(1);
        });
    });

    describe("when the title contains property separators", () => {
        it("should escape colon and comma in the title", () => {
            const command = formatWorkflowCommand({
                severity: "warning",
                ruleId: "a:b,c",
                message: "m",
            });

            expect(command).toBe("::warning title=a%3Ab%2Cc::m");
        });
    });

    describe("when the diagnostic has no rule id", () => {
        it("should produce a command without a title", () => {
            const command = formatWorkflowCommand({
                severity: "warning",
                message: "m",
            });

            expect(command).toBe("::warning::m");
        });
    });

    describe("when the title contains every character the runner escapes", () => {
        it("should escape the percent sign first, then line breaks, colon and comma", () => {
            const command = formatWorkflowCommand({
                severity: "warning",
                ruleId: "a%b\r\nc:d,e",
                message: "m",
            });

            expect(command).toBe("::warning title=a%25b%0D%0Ac%3Ad%2Ce::m");
        });
    });
});
