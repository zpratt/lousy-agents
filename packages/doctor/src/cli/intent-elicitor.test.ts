import Chance from "chance";
import { createConsola } from "consola";
import { describe, expect, it, vi } from "vitest";
import type { AmbiguityQuestion } from "../use-cases/detect-ambiguities.js";
import {
    createConsoleConfirm,
    createIntentElicitor,
} from "./intent-elicitor.js";

const chance = new Chance();

function buildQuestion(): AmbiguityQuestion {
    return {
        id: chance.word(),
        question: chance.sentence(),
        hint: chance.sentence(),
    };
}

function buildLogger() {
    const logged: string[] = [];
    const logger = createConsola({
        level: 3,
        reporters: [{ log: (entry) => logged.push(entry.args.join(" ")) }],
    });
    return { logger, logged };
}

describe("createIntentElicitor", () => {
    describe("when several questions are asked", () => {
        it("should show every hint and ask every question in order", async () => {
            const questions = [
                buildQuestion(),
                buildQuestion(),
                buildQuestion(),
            ];
            const confirm = vi.fn().mockResolvedValue(false);
            const { logger, logged } = buildLogger();

            await createIntentElicitor({ logger, confirm })(questions);

            expect(confirm.mock.calls).toEqual(
                questions.map((question) => [question.question]),
            );
            expect(logged).toEqual(
                questions.map((question) => `\n${question.hint}`),
            );
        });

        it("should acknowledge only the questions that were answered yes", async () => {
            const questions = [
                buildQuestion(),
                buildQuestion(),
                buildQuestion(),
            ];
            const confirm = vi
                .fn()
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);
            const { logger, logged } = buildLogger();

            await createIntentElicitor({ logger, confirm })(questions);

            expect(logged.filter((line) => line === "  Noted.")).toHaveLength(
                2,
            );
        });
    });

    describe("when no question is asked", () => {
        it("should not prompt or log anything", async () => {
            const confirm = vi.fn();
            const { logger, logged } = buildLogger();

            await createIntentElicitor({ logger, confirm })([]);

            expect(confirm).not.toHaveBeenCalled();
            expect(logged).toEqual([]);
        });
    });
});

describe("createConsoleConfirm", () => {
    it("should ask a confirm prompt that defaults to no and return the answer", async () => {
        const question = chance.sentence();
        const answer = chance.bool();
        const prompt = vi.fn().mockResolvedValue(answer);
        const logger = createConsola({ prompt });

        const result = await createConsoleConfirm(logger)(question);

        expect(prompt).toHaveBeenCalledTimes(1);
        expect(prompt).toHaveBeenCalledWith(question, {
            type: "confirm",
            initial: false,
        });
        expect(result).toBe(answer);
    });
});
