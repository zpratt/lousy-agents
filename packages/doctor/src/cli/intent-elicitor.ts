import type { ConsolaInstance } from "consola";
import type { AmbiguityQuestion } from "../use-cases/detect-ambiguities.js";

export interface IntentElicitorPorts {
    logger: ConsolaInstance;
    confirm(question: string): Promise<boolean>;
}

export function createConsoleConfirm(
    logger: ConsolaInstance,
): (question: string) => Promise<boolean> {
    return (question) =>
        logger.prompt(question, { type: "confirm", initial: false });
}

export function createIntentElicitor({
    logger,
    confirm,
}: IntentElicitorPorts): (questions: AmbiguityQuestion[]) => Promise<void> {
    return async (questions) => {
        for (const question of questions) {
            logger.info(`\n${question.hint}`);
            const answer = await confirm(question.question);
            if (answer) {
                logger.info("  Noted.");
            }
        }
    };
}
