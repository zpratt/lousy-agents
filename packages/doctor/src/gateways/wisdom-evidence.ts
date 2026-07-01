import { resolve, sep } from "node:path";
import { readTextWithinRoot } from "@lousy-agents/core/gateways/file-system-utils.js";
import type { CitationHandle } from "../entities/finding.js";
import type { WisdomClient } from "./wisdom-client.js";
import { WisdomUnavailableError } from "./wisdom-client.js";

const MAX_EVIDENCE_BYTES = 1_048_576;

export interface EvidencePassage {
    citation: CitationHandle;
    text: string;
}

export async function resolveEvidence(
    nodeId: string,
    wisdomDir: string,
    client: WisdomClient,
): Promise<EvidencePassage> {
    const node = await client.findNodeById(nodeId);
    if (!node) {
        throw new WisdomUnavailableError(`node '${nodeId}' not found in graph`);
    }

    if (!node.sourceFile || typeof node.sourceFile !== "string") {
        throw new WisdomUnavailableError(
            `node '${nodeId}' has no sourceFile reference`,
        );
    }

    const absoluteWisdomDir = resolve(wisdomDir);
    const absSourcePath = resolve(absoluteWisdomDir, node.sourceFile);

    const isWithinWisdomDirLexical =
        absSourcePath === absoluteWisdomDir ||
        absSourcePath.startsWith(`${absoluteWisdomDir}${sep}`);

    if (!isWithinWisdomDirLexical) {
        throw new WisdomUnavailableError(
            `source file '${node.sourceFile}' escapes wisdom directory — path traversal rejected`,
        );
    }

    let fileContent: string;
    try {
        fileContent = await readTextWithinRoot(
            absoluteWisdomDir,
            node.sourceFile,
            MAX_EVIDENCE_BYTES,
        );
    } catch {
        throw new WisdomUnavailableError(
            `source file '${node.sourceFile}' not found`,
        );
    }

    const lineStart = node.lineStart;
    const lineEnd = node.lineEnd;
    let text: string;

    if (
        typeof lineStart === "number" &&
        typeof lineEnd === "number" &&
        lineEnd >= lineStart
    ) {
        const lines = fileContent.split("\n");
        text = lines.slice(lineStart - 1, lineEnd).join("\n");
    } else {
        text = fileContent;
    }

    const snapshotRef =
        typeof node.snapshotRef === "string" ? node.snapshotRef : undefined;

    const citation: CitationHandle = {
        nodeId,
        sourceFile: node.sourceFile,
        lineRange:
            typeof lineStart === "number" &&
            typeof lineEnd === "number" &&
            lineEnd >= lineStart
                ? [lineStart, lineEnd]
                : undefined,
        snapshotRef,
    };

    return { citation, text };
}
