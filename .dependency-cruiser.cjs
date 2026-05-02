module.exports = {
  extends: "./node_modules/dependency-cruiser/configs/recommended.cjs",
  forbidden: [
    {
      name: "lint-public-api-not-to-validation-infrastructure",
      severity: "error",
      comment:
        "Keep the @lousy-agents/lint public barrel decoupled from filesystem-backed directory validation internals.",
      from: {
        path: "^packages/lint/src/index[.]ts$",
      },
      to: {
        path: "^packages/lint/src/validate-directory[.]ts$",
      },
    },
    {
      name: "lint-core-concrete-only-in-composition-root",
      severity: "error",
      comment:
        "Only the lint package composition root may wire concrete core gateways, use cases, and configuration loaders.",
      from: {
        path: "^packages/lint/src/(?!lint[.]ts$).+",
      },
      to: {
        path: "^packages/core/src/(gateways|lib|use-cases)/",
      },
    },
  ],
  options: {
    webpackConfig: {
      fileName: ".dependency-cruiser.webpack.cjs",
    },
    includeOnly: ["^packages/lint/src", "^packages/core/src"],
    exclude: {
      path: "[.](test|spec)[.]ts$|[.]d[.]ts$",
    },
    doNotFollow: {
      dependencyTypes: [
        "npm",
        "npm-dev",
        "npm-optional",
        "npm-peer",
        "npm-bundled",
        "core",
      ],
    },
    tsPreCompilationDeps: true,
  },
};
