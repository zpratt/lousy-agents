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
import type { InstructionDiscoveryDiagnostic } from "../entities/instruction-quality.js";
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
        const diagnostics: InstructionDiscoveryDiagnostic[] = [];
        const instructionFiles = await this.findInstructionFiles(
            targetDir,
            diagnostics,
        );
        const targetNames = [...scripts, ...tools].map((item) => item.name);

        const references: InstructionReference[] = [];
        for (const file of instructionFiles) {
            references.push(
                ...(await this.findReferencesInFile(
                    targetDir,
                    file,
                    targetNames,
                )),
            );
        }

        const documentedTargets = new Set(
            references.map((reference) => reference.target),
        );

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
            diagnostics,
            summary: {
                totalMandatory,
                totalDocumented,
                coveragePercentage: Math.round(coveragePercentage * 100) / 100,
            },
        };
    }

    private async findInstructionFiles(
        targetDir: string,
        diagnostics: InstructionDiscoveryDiagnostic[],
    ): Promise<InstructionFileToScan[]> {
        const discovered = await this.discoveryGateway.discoverInstructionFiles(
            targetDir,
            (diagnostic) => diagnostics.push(diagnostic),
        );

        return discovered.map((file) => ({
            reportedPath: relative(targetDir, file.filePath),
            contentPath: relative(targetDir, file.contentPath ?? file.filePath),
        }));
    }

    /**
     * Finds the references to every target in one instruction file, grouped by
     * target in the order the targets are given.
     */
    private async findReferencesInFile(
        targetDir: string,
        file: InstructionFileToScan,
        targetNames: readonly string[],
    ): Promise<InstructionReference[]> {
        const content = await readTextWithinRoot(
            targetDir,
            file.contentPath,
            MAX_INSTRUCTION_FILE_BYTES,
        );
        const lines = content.split("\n");
        const reportedPath = join(targetDir, file.reportedPath);

        return targetNames.flatMap((target) =>
            this.findReferencesInContent(
                target,
                content,
                lines,
                reportedPath,
                targetDir,
            ),
        );
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
