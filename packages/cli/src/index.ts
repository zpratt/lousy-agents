import { defineCommand, runMain } from "citty";
import { captureCommand } from "./commands/capture.js";
import { contextCommand } from "./commands/context.js";
import { copilotSetupCommand } from "./commands/copilot-setup.js";
import { initCommand } from "./commands/init.js";
import { initHooksCommand } from "./commands/init-hooks.js";
import { lintCommand } from "./commands/lint.js";
import { newCommand } from "./commands/new.js";

const main = defineCommand({
    meta: {
        name: "lousy-agents",
        version: "0.1.0",
        description: "Simple scaffolding tool for AI-assisted development",
    },
    subCommands: {
        init: initCommand,
        lint: lintCommand,
        new: newCommand,
        "copilot-setup": copilotSetupCommand,
        context: contextCommand,
        "init-hooks": initHooksCommand,
        capture: captureCommand,
    },
});

runMain(main);
