import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    /* config options here */
    reactStrictMode: true,
    webpack: (config) => {
        config.externals.push({
            vitest: "vitest",
            vite: "vite",
            "node:module": "node:module",
        });
        return config;
    },
};

export default nextConfig;
