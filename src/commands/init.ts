import { defineCommand } from "citty";
import { consola } from "consola";

type ProjectType = "CLI" | "webapp" | "REST API" | "GraphQL API";

export const initCommand = defineCommand({
    meta: {
        name: "init",
        description: "Initialize a new project with lousy agents scaffolding",
    },
    run: async (context?: { prompt?: typeof consola.prompt }) => {
        const promptFn = context?.prompt || consola.prompt;

        const projectType = await promptFn<{
            type: "select";
            options: ProjectType[];
        }>("What type of project are you initializing?", {
            type: "select",
            options: ["CLI", "webapp", "REST API", "GraphQL API"],
        });

        console.log(`Selected project type: ${projectType}`);
    },
});
