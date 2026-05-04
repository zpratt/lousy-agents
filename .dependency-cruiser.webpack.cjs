const { resolve } = require("node:path");

module.exports = {
    resolve: {
        extensions: [".ts", ".js"],
        extensionAlias: {
            ".js": [".ts", ".js"],
        },
        alias: {
            "@lousy-agents/core": resolve(__dirname, "packages/core/src"),
            "@lousy-agents/lint": resolve(__dirname, "packages/lint/src"),
        },
    },
};
