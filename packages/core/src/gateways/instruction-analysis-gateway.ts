/**
 * Gateway for analyzing repository instructions for feedback loop coverage
 */

import { join, relative } from "node:path";
import type {
    DiscoveredScript,
    DiscoveredTool,
    FeedbackLoopCoverage,
    InstructionReference,
} from "../entities/feedback-loop.js";
import type { InstructionFileDiscoveryGateway } from "../use-cases/analyze-instruction-quality.js";
import type { InstructionAnalysisGateway } from "../use-cases/validate-instruction-coverage.js";
import { readTextWithinRoot } from "./file-system-utils.js";
import { createInstructionFileDiscoveryGateway } from "./instruction-file-discovery-gateway.js";

export type { InstructionAnalysisGateway };

const MAX_INSTRUCTION_FILE_BYTES = 1_048_576;

/**
 * An instruction file to scan, as paths relative to the target directory.
 */
interface InstructionFileToScan {
    /** Path reported in references (where the harness loads the file) */
    readonly reportedPath: string;
    /** Symlink-free path to read the content from */
    readonly contentPath: string;
}

/**
 * File system implementation of instruction analysis gateway.
 * Scans the same instruction files that instruction quality analysis
 * discovers (the shared agentic location catalog).
 */
export class FileSystemInstructionAnalysisGateway
    implements InstructionAnalysisGateway
{
    constructor(
        private readonly discoveryGateway: InstructionFileDiscoveryGateway = createInstructionFileDiscoveryGateway(),
    ) {}

    async analyzeCoverage(
        targetDir: string,
        scripts: DiscoveredScript[],
        tools: DiscoveredTool[],
    ): Promise<FeedbackLoopCoverage> {
        const instructionFiles = await this.findInstructionFiles(targetDir);

        const references: InstructionReference[] = [];
        const documentedTargets = new Set<string>();

        for (const file of instructionFiles) {
            const content = await readTextWithinRoot(
                targetDir,
                file.contentPath,
                MAX_INSTRUCTION_FILE_BYTES,
            );
            const lines = content.split("\n");

            for (const script of scripts) {
                const scriptRefs = this.findReferencesInContent(
                    script.name,
                    content,
                    lines,
                    join(targetDir, file.reportedPath),
                    targetDir,
                );
                if (scriptRefs.length > 0) {
                    references.push(...scriptRefs);
                    documentedTargets.add(script.name);
                }
            }

            for (const tool of tools) {
                const toolRefs = this.findReferencesInContent(
                    tool.name,
                    content,
                    lines,
                    join(targetDir, file.reportedPath),
                    targetDir,
                );
                if (toolRefs.length > 0) {
                    references.push(...toolRefs);
                    documentedTargets.add(tool.name);
                }
            }
        }

        const mandatoryScripts = scripts.filter((s) => s.isMandatory);
        const mandatoryTools = tools.filter((t) => t.isMandatory);
        const allMandatory = [...mandatoryScripts, ...mandatoryTools];

        const missingInInstructions = allMandatory.filter(
            (item) => !documentedTargets.has(item.name),
        );
        const documentedInInstructions = allMandatory.filter((item) =>
            documentedTargets.has(item.name),
        );

        const totalMandatory = allMandatory.length;
        const totalDocumented = documentedInInstructions.length;
        const coveragePercentage =
            totalMandatory === 0
                ? 100
                : (totalDocumented / totalMandatory) * 100;

        return {
            missingInInstructions,
            documentedInInstructions,
            references,
            summary: {
                totalMandatory,
                totalDocumented,
                coveragePercentage: Math.round(coveragePercentage * 100) / 100,
            },
        };
    }

    private async findInstructionFiles(
        targetDir: string,
    ): Promise<InstructionFileToScan[]> {
        const discovered =
            await this.discoveryGateway.discoverInstructionFiles(targetDir);

        return discovered.map((file) => ({
            reportedPath: relative(targetDir, file.filePath),
            contentPath: relative(targetDir, file.contentPath ?? file.filePath),
        }));
    }

    private findReferencesInContent(
        target: string,
        content: string,
        lines: string[],
        file: string,
        targetDir: string,
    ): InstructionReference[] {
        const references: InstructionReference[] = [];

        const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const targetPattern = new RegExp(
            `(?:^|[^\\w])(${escapedTarget})(?=$|[^\\w])`,
            "i",
        );

        if (!targetPattern.test(content)) {
            return references;
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (targetPattern.test(line)) {
                const contextLines: string[] = [];
                if (i > 0) contextLines.push(lines[i - 1]);
                contextLines.push(line);
                if (i < lines.length - 1) contextLines.push(lines[i + 1]);

                const relativePath = relative(targetDir, file);

                references.push({
                    target,
                    file: relativePath,
                    line: i + 1,
                    context: contextLines.join("\n"),
                });
            }
        }

        return references;
    }
}

/**
 * Creates and returns the default instruction analysis gateway
 */
export function createInstructionAnalysisGateway(): InstructionAnalysisGateway {
    return new FileSystemInstructionAnalysisGateway();
}
