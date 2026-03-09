import { defineCommand, runMain } from "citty";

const main = defineCommand({
    meta: {
        name: "<%= it.projectName %>",
        description: "CLI application built with citty",
    },
});

runMain(main);
