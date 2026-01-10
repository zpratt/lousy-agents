#!/usr/bin/env node

import { defineCommand, runMain } from "citty";
import { copilotCommand } from "./commands/copilot.js";
import { initCommand } from "./commands/init.js";

const main = defineCommand({
    meta: {
        name: "lousy-agents",
        version: "0.1.0",
        description: "Simple scaffolding tool for AI-assisted development",
    },
    subCommands: {
        init: initCommand,
        copilot: copilotCommand,
    },
});

runMain(main);
