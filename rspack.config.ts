import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rspack, { type Configuration } from "@rspack/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: Configuration = {
    plugins: [
        new rspack.BannerPlugin({
            banner: "#!/usr/bin/env node",
            raw: true,
            entryOnly: true,
        }),
    ],
    mode: "production",
    target: "node",
    entry: {
        index: "./src/index.ts",
        "mcp-server": "./src/mcp-server.ts",
    },
    output: {
        path: resolve(__dirname, "dist"),
        filename: "[name].js",
        clean: true,
        library: {
            type: "module",
        },
        chunkFormat: "module",
        module: true,
    },
    experiments: {
        outputModule: true,
    },
    resolve: {
        extensions: [".ts", ".js"],
        extensionAlias: {
            ".js": [".ts", ".js"],
        },
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    module: {
        parser: {
            javascript: {
                importMeta: false,
            },
        },
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                loader: "builtin:swc-loader",
                options: {
                    jsc: {
                        parser: {
                            syntax: "typescript",
                        },
                        target: "es2022",
                    },
                },
                type: "javascript/auto",
            },
        ],
    },
    optimization: {
        minimize: false,
        splitChunks: false,
    },
    externalsType: "module",
};

export default config;
