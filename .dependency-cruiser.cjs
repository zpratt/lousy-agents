module.exports = {
    extends: "./node_modules/dependency-cruiser/configs/recommended.cjs",
    forbidden: [
        // ── Clean Architecture: Layer 1 – Entities ─────────────────────────────
        // Entities are the innermost layer. They must not import from any outer
        // layer; only entity-to-entity imports are permitted.
        {
            name: "no-entities-to-use-cases",
            severity: "error",
            comment:
                "Layer 1 (entities) must not import from Layer 2 (use-cases). " +
                "The dependency rule requires inner layers to remain unaware of outer layers.",
            from: {
                path: "^packages/[^/]+/src/entities/",
            },
            to: {
                path: "^packages/[^/]+/src/use-cases/",
            },
        },
        {
            name: "no-entities-to-adapters",
            severity: "error",
            comment:
                "Layer 1 (entities) must not import from Layer 3 adapters " +
                "(gateways, lib, or formatters). Entities must have zero framework dependencies.",
            from: {
                path: "^packages/[^/]+/src/entities/",
            },
            to: {
                path: "^packages/[^/]+/src/(gateways|lib|formatters)/",
            },
        },
        // ── Clean Architecture: Layer 2 – Use Cases ────────────────────────────
        // Use cases define ports (interfaces) for external dependencies but must
        // never import concrete adapter implementations.
        {
            name: "no-use-cases-to-adapters",
            severity: "error",
            comment:
                "Layer 2 (use-cases) must not import from Layer 3 adapters " +
                "(gateways, lib, or formatters). Use cases define ports; they must " +
                "not depend on concrete implementations.",
            from: {
                path: "^packages/[^/]+/src/use-cases/",
            },
            to: {
                path: "^packages/[^/]+/src/(gateways|lib|formatters)/",
            },
        },
        // ── Clean Architecture: Layer 3 – Adapters ─────────────────────────────
        // Adapters (gateways, lib, formatters) must not depend on the composition
        // root. The composition root is the only place that wires dependencies.
        {
            name: "no-adapters-to-composition-root",
            severity: "error",
            comment:
                "Layer 3 adapters (gateways, lib, formatters) must not import from " +
                "the core composition root (index.ts). Only Layer 4 may import from all layers.",
            from: {
                path: "^packages/[^/]+/src/(gateways|lib|formatters)/",
            },
            to: {
                path: "^packages/[^/]+/src/index[.]ts$",
            },
        },
        // ── Clean Architecture: protect composition roots from inner layers ───────
        // Entities and use-cases must not import the composition root.
        {
            name: "no-entities-to-composition-root",
            severity: "error",
            comment:
                "Layer 1 (entities) must not import from the composition root (index.ts). " +
                "Inner layers must be unaware of wiring.",
            from: {
                path: "^packages/[^/]+/src/entities/",
            },
            to: {
                path: "^packages/[^/]+/src/index[.]ts$",
            },
        },
        {
            name: "no-use-cases-to-composition-root",
            severity: "error",
            comment:
                "Layer 2 (use-cases) must not import from the composition root (index.ts). " +
                "Use cases must only depend on entities and ports.",
            from: {
                path: "^packages/[^/]+/src/use-cases/",
            },
            to: {
                path: "^packages/[^/]+/src/index[.]ts$",
            },
        },

        // lint-errors.ts is a pure domain error type with no implementation
        // dependencies. It must not import from any other lint source file so it
        // remains a stable, infrastructure-free contract.
        {
            name: "lint-errors-no-internal-deps",
            severity: "error",
            comment:
                "lint-errors.ts is a pure error-contract module (Layer 1 equivalent) " +
                "and must not import from any other lint package module. " +
                "Keeping it dependency-free ensures a stable public error surface.",
            from: {
                path: "^packages/lint/src/lint-errors[.]ts$",
            },
            to: {
                path: "^packages/lint/src/(?!lint-errors[.]ts$)",
            },
        },
        // ── lint package: public API barrel isolation ───────────────────────────
        // The public barrel (index.ts) re-exports stable contracts. It must not
        // depend on filesystem-backed implementation modules so consumers see only
        // the declared API surface.
        {
            name: "lint-public-api-not-to-validation-infrastructure",
            severity: "error",
            comment:
                "Keep the @lousy-agents/lint public barrel decoupled from " +
                "filesystem-backed directory validation internals.",
            from: {
                path: "^packages/lint/src/index[.]ts$",
            },
            to: {
                path: "^packages/lint/src/validate-directory[.]ts$",
            },
        },
        // ── lint package: only composition root wires concrete dependencies ─────
        // lint.ts is the composition root (Layer 4). It is the sole module
        // permitted to import concrete core gateways, use cases, and configuration
        // loaders. All other lint modules must remain at the entities or adapter
        // boundary.
        {
            name: "lint-core-concrete-only-in-composition-root",
            severity: "error",
            comment:
                "Only the lint package composition root may wire concrete core " +
                "gateways, use cases, and configuration loaders.",
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
        includeOnly: [
            "^packages/lint/src",
            "^packages/core/src",
            "^packages/agent-shell/src",
            "^packages/cli/src",
            "^packages/mcp/src",
        ],
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
