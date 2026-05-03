/**
 * Gateway for analyzing repository instructions for feedback loop coverage
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
    DiscoveredScript,
    DiscoveredTool,
    FeedbackLoopCoverage,
    InstructionReference,
} from "../entities/feedback-loop.js";
import type { InstructionAnalysisGateway } from "../use-cases/validate-instruction-coverage.js";
import { fileExists } from "./file-system-utils.js";

export type { InstructionAnalysisGateway };

/**
 * File system implementation of instruction analysis gateway
 */
export class FileSystemInstructionAnalysisGateway
    implements InstructionAnalysisGateway
{
    async analyzeCoverage(
        targetDir: string,
        scripts: DiscoveredScript[],
        tools: DiscoveredTool[],
    ): Promise<FeedbackLoopCoverage> {
        const instructionFiles = await this.findInstructionFiles(targetDir);

        const references: InstructionReference[] = [];
        const documentedTargets = new Set<string>();

        for (const file of instructionFiles) {
            const content = await readFile(file, "utf-8");
            const lines = content.split("\n");

            for (const script of scripts) {
                const scriptRefs = this.findReferencesInContent(
                    script.name,
                    content,
                    lines,
                    file,
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
                    file,
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

    private async findInstructionFiles(targetDir: string): Promise<string[]> {
        const files: string[] = [];

        const copilotInstructions = join(
            targetDir,
            ".github",
            "copilot-instructions.md",
        );
        if (await fileExists(copilotInstructions)) {
            files.push(copilotInstructions);
        }

        const instructionsDir = join(targetDir, ".github", "instructions");
        if (await fileExists(instructionsDir)) {
            try {
                const instructionFiles = await readdir(instructionsDir);
                for (const file of instructionFiles) {
                    if (file.endsWith(".md")) {
                        files.push(join(instructionsDir, file));
                    }
                }
            } catch {
            }
        }

        return files;
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
