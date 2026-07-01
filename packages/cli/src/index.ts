import { createInitHooksConfigGateway } from "@lousy-agents/core/gateways/init-hooks-config-gateway.js";
import { createLessonFileGateway } from "@lousy-agents/core/gateways/lesson-file-gateway.js";
import { InitHooksUseCase } from "@lousy-agents/core/use-cases/init-hooks-use-case.js";
import { LessonContextUseCase } from "@lousy-agents/core/use-cases/lesson-context-use-case.js";
import { LintLessonsUseCase } from "@lousy-agents/core/use-cases/lint-lessons-use-case.js";
import { defineCommand, runMain } from "citty";
import { captureCommand } from "./commands/capture.js";
import { createContextCommand } from "./commands/context.js";
import { copilotSetupCommand } from "./commands/copilot-setup.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { createInitHooksCommand } from "./commands/init-hooks.js";
import { createLintCommand } from "./commands/lint.js";
import { createLintLessonsCommand } from "./commands/lint-lessons.js";
import { newCommand } from "./commands/new.js";

// Gateways
const lessonFileGateway = createLessonFileGateway();
const initHooksConfigGateway = createInitHooksConfigGateway();

// Use cases
const lessonContextUseCase = new LessonContextUseCase(lessonFileGateway);
const initHooksUseCase = new InitHooksUseCase(initHooksConfigGateway);
const lintLessonsUseCase = new LintLessonsUseCase(lessonFileGateway);

// Commands
const contextCmd = createContextCommand(lessonContextUseCase);
const initHooksCmd = createInitHooksCommand(initHooksUseCase);
const lintLessonsCmd = createLintLessonsCommand(lintLessonsUseCase);
const lintCmd = createLintCommand(lintLessonsCmd);

const main = defineCommand({
    meta: {
        name: "lousy-agents",
        version: "0.1.0",
        description: "Simple scaffolding tool for AI-assisted development",
    },
    subCommands: {
        init: initCommand,
        lint: lintCmd,
        new: newCommand,
        "copilot-setup": copilotSetupCommand,
        context: contextCmd,
        "init-hooks": initHooksCmd,
        capture: captureCommand,
        doctor: doctorCommand,
    },
});

runMain(main);
