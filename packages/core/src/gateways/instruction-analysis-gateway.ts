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
import { MAX_INSTRUCTION_FILE_BYTES } from "../entities/file-limits.js";
import type { InstructionDiscoveryDiagnostic } from "../entities/instruction-quality.js";
import { INSTRUCTION_PARSE_ERROR_RULE_ID } from "../entities/lint-rules.js";
import type { InstructionFileDiscoveryGateway } from "../use-cases/analyze-instruction-quality.js";
import type { InstructionAnalysisGateway } from "../use-cases/validate-instruction-coverage.js";
import { readTextWithinRoot } from "./file-system-utils.js";
import { createInstructionFileDiscoveryGateway } from "./instruction-file-discovery-gateway.js";

export type { InstructionAnalysisGateway };

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
        const { files: instructionFiles, diagnostics: discoveryDiagnostics } =
            await this.findInstructionFiles(targetDir);
        const targetNames = [...scripts, ...tools].map((item) => item.name);

        const references: InstructionReference[] = [];
        const unreadable: InstructionDiscoveryDiagnostic[] = [];
        for (const file of instructionFiles) {
            const content = await this.readInstructionFile(targetDir, file);
            if (content.ok) {
                references.push(
                    ...this.findReferencesInFile(
                        targetDir,
                        file,
                        content.text,
                        targetNames,
                    ),
                );
            } else {
                unreadable.push({
                    ruleId: INSTRUCTION_PARSE_ERROR_RULE_ID,
                    message: `Could not read ${file.reportedPath} (${content.reason}), so it was not checked.`,
                });
            }
        }
        const diagnostics = [...discoveryDiagnostics, ...unreadable];

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

    private async findInstructionFiles(targetDir: string): Promise<{
        files: InstructionFileToScan[];
        diagnostics: InstructionDiscoveryDiagnostic[];
    }> {
        const diagnostics: InstructionDiscoveryDiagnostic[] = [];
        const discovered = await this.discoveryGateway.discoverInstructionFiles(
            targetDir,
            (diagnostic) => diagnostics.push(diagnostic),
        );

        return {
            files: discovered.map((file) => ({
                reportedPath: relative(targetDir, file.filePath),
                contentPath: relative(
                    targetDir,
                    file.contentPath ?? file.filePath,
                ),
            })),
            diagnostics,
        };
    }

    /**
     * Reads one instruction file, or says why it could not be read (a hard
     * link, a file over the size limit, a file that vanished), so one file
     * that cannot be read leaves out only itself and not the whole analysis.
     */
    private async readInstructionFile(
        targetDir: string,
        file: InstructionFileToScan,
    ): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
        try {
            const text = await readTextWithinRoot(
                targetDir,
                file.contentPath,
                MAX_INSTRUCTION_FILE_BYTES,
            );
            return { ok: true, text };
        } catch (error: unknown) {
            return {
                ok: false,
                reason: error instanceof Error ? error.message : "unreadable",
            };
        }
    }

    /**
     * Finds the references to every target in one instruction file, grouped by
     * target in the order the targets are given.
     */
    private findReferencesInFile(
        targetDir: string,
        file: InstructionFileToScan,
        content: string,
        targetNames: readonly string[],
    ): InstructionReference[] {
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
