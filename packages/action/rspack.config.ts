import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rspack, { type Configuration } from "@rspack/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: Configuration = {
    plugins: [
        new rspack.optimize.LimitChunkCountPlugin({
            maxChunks: 1,
        }),
    ],
    mode: "production",
    target: "node",
    devtool: false,
    entry: {
        index: "./src/index.ts",
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
            "@lousy-agents/core": resolve(__dirname, "../core/src"),
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
                    minify: true,
                },
                type: "javascript/auto",
            },
        ],
    },
    optimization: {
        minimize: true,
        usedExports: true,
        sideEffects: true,
        splitChunks: false,
    },
    externalsType: "module",
};

export default config;
