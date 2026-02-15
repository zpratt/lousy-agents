/**
 * Gateway for analyzing repository instructions for feedback loop coverage
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
    DiscoveredScript,
    DiscoveredTool,
    FeedbackLoopCoverage,
    InstructionReference,
} from "../entities/feedback-loop.js";
import { fileExists } from "./file-system-utils.js";

/**
 * Gateway interface for analyzing instruction coverage
 */
export interface InstructionAnalysisGateway {
    /**
     * Analyzes repository instructions to determine coverage of mandatory feedback loops
     * @param targetDir The repository root directory
     * @param scripts Discovered scripts to check for documentation
     * @param tools Discovered tools to check for documentation
     * @returns Coverage analysis result
     */
    analyzeCoverage(
        targetDir: string,
        scripts: DiscoveredScript[],
        tools: DiscoveredTool[],
    ): Promise<FeedbackLoopCoverage>;
}

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
        // Find all instruction files
        const instructionFiles = await this.findInstructionFiles(targetDir);

        // Read and search instruction content
        const references: InstructionReference[] = [];
        const documentedTargets = new Set<string>();

        for (const file of instructionFiles) {
            const content = await readFile(file, "utf-8");
            const lines = content.split("\n");

            // Check for script references (e.g., "npm test", "npm run build")
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

            // Check for tool references (e.g., "mise run test", "biome check")
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

        // Filter mandatory scripts/tools
        const mandatoryScripts = scripts.filter((s) => s.isMandatory);
        const mandatoryTools = tools.filter((t) => t.isMandatory);
        const allMandatory = [...mandatoryScripts, ...mandatoryTools];

        // Categorize as missing or documented
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

        // Check for .github/copilot-instructions.md
        const copilotInstructions = join(
            targetDir,
            ".github",
            "copilot-instructions.md",
        );
        if (await fileExists(copilotInstructions)) {
            files.push(copilotInstructions);
        }

        // Check for .github/instructions/*.md
        const instructionsDir = join(targetDir, ".github", "instructions");
        if (await fileExists(instructionsDir)) {
            const instructionFiles = await readdir(instructionsDir);
            for (const file of instructionFiles) {
                if (file.endsWith(".md")) {
                    files.push(join(instructionsDir, file));
                }
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

        // Search for target in content (case-insensitive for better matching)
        const lowerContent = content.toLowerCase();
        const lowerTarget = target.toLowerCase();

        if (!lowerContent.includes(lowerTarget)) {
            return references;
        }

        // Find line numbers where target appears
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.toLowerCase().includes(lowerTarget)) {
                // Get context (line before and after if available)
                const contextLines: string[] = [];
                if (i > 0) contextLines.push(lines[i - 1]);
                contextLines.push(line);
                if (i < lines.length - 1) contextLines.push(lines[i + 1]);

                const relativePath = file
                    .replace(targetDir, "")
                    .replace(/^\//, "");

                references.push({
                    target,
                    file: relativePath,
                    line: i + 1, // 1-indexed
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
