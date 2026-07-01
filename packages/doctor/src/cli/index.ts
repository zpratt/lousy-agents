import { resolve } from "node:path";
import { defineCommand, runMain } from "citty";
import { createConsola } from "consola";
import {
    hasBlockingFindings,
    renderHuman,
} from "../formatters/human-renderer.js";
import { toJson } from "../formatters/json-formatter.js";
import { formatSummary } from "../formatters/summary-formatter.js";
import { readIntentArtifact } from "../gateways/intent-artifact.js";
import { scanRepository } from "../gateways/scanner.js";
import {
    createWisdomClient,
    WisdomUnavailableError,
} from "../gateways/wisdom-client.js";
import { classifyArchetype } from "../use-cases/classify-archetype.js";
import { CRITERIA } from "../use-cases/criteria.js";
import { detectAmbiguities } from "../use-cases/detect-ambiguities.js";
import { evaluate } from "../use-cases/evaluate-engine.js";

const main = defineCommand({
    meta: {
        name: "agentic-doctor",
        version: "0.1.0",
        description:
            "Diagnose agentic configuration across harnesses: inventory, classify, elicit intent, and evaluate preconditions",
    },
    args: {
        summary: {
            type: "boolean",
            description: "Show archetype classification only — skip evaluation",
            default: false,
        },
        format: {
            type: "string",
            description: "Output format: human (default) or json",
            default: "human",
        },
        ci: {
            type: "boolean",
            description:
                "Force non-interactive mode (skip elicitation prompts, apply conservative inference)",
            default: false,
        },
    },
    async run({ args }) {
        const logger = createConsola();
        const repoPath = resolve(process.cwd());
        const format = args.format === "json" ? "json" : "human";

        const records = await scanRepository(repoPath);
        const classification = classifyArchetype(records);
        const summary = formatSummary(records, classification);

        // Load wisdom graph for snapshotRef (gracefully degrade if unavailable)
        const wisdomDir = resolve(repoPath, "wisdom");
        let snapshotRef: string | undefined;
        try {
            const wisdomClient = createWisdomClient(wisdomDir);
            const graph = await wisdomClient.getGraph();
            snapshotRef = graph.snapshotRef;
        } catch (err) {
            if (!(err instanceof WisdomUnavailableError)) throw err;
            logger.debug(
                "Wisdom graph unavailable — snapshotRef will be omitted",
            );
        }

        if (args.summary) {
            if (format === "json") {
                process.stdout.write(
                    `${JSON.stringify({ archetype: summary.archetype, dominanceScore: summary.dominanceScore, totalRecords: summary.totalRecords, harnessBreakdown: summary.harnessBreakdown, crossHarnessEdges: summary.crossHarnessEdges }, null, 2)}\n`,
                );
            } else {
                renderHuman(summary, [], logger, snapshotRef);
            }
            return;
        }

        if (classification.archetype === "none") {
            if (format === "json") {
                process.stdout.write(
                    `${JSON.stringify(toJson(summary, [], snapshotRef), null, 2)}\n`,
                );
            } else {
                logger.info("No agentic constructs found in the repository.");
            }
            return;
        }

        const intentResult = await readIntentArtifact(repoPath);
        let intent = intentResult.found ? intentResult.artifact : null;

        // Interactive elicitation when no intent artifact and running in a TTY
        const isInteractive = !args.ci && process.stdin.isTTY === true;
        if (intent === null && isInteractive) {
            const questions = detectAmbiguities(records, classification);
            for (const q of questions) {
                logger.info(`\n${q.hint}`);
                const answer = await logger.prompt(q.question, {
                    type: "confirm",
                    initial: false,
                });
                if (answer) {
                    logger.info("  Noted.");
                }
            }
            // After interactive prompts, re-read in case user pre-created the artifact
            const retried = await readIntentArtifact(repoPath);
            if (retried.found) intent = retried.artifact;
        }

        const findings = evaluate(CRITERIA, {
            records,
            classification,
            intent,
        });

        if (format === "json") {
            const report = toJson(summary, findings, snapshotRef);
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        } else {
            renderHuman(summary, findings, logger, snapshotRef);
        }

        if (hasBlockingFindings(findings)) {
            process.exitCode = 1;
        }
    },
});

runMain(main);
