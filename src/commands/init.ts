import { defineCommand } from "citty";

export const initCommand = defineCommand({
    meta: {
        name: "init",
        description: "Initialize a new project with lousy agents scaffolding",
    },
    run: async () => {
        console.log("hello init");
    },
});
