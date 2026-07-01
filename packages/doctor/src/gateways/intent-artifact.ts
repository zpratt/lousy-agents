import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
    readTextWithinRoot,
    resolveSafePath,
} from "@lousy-agents/core/gateways/file-system-utils.js";
import { z } from "zod";
import type { DeclaredIntentArtifact } from "../entities/declared-intent.js";
import type { HarnessName } from "../entities/edge-types.js";

const MAX_INTENT_BYTES = 65_536;

const ARTIFACT_FILENAME = "intent.json";
const ARTIFACT_DIR = ".agentic-doctor";

const DeclaredIntentSchema = z.object({
    targetHarnesses: z.array(
        z.enum([
            "claude",
            "copilot",
            "codex",
            "antigravity",
            "hermes",
            "crush",
            "pi",
            "shared",
        ]),
    ),
    desiredCapabilities: z.array(z.string()),
    confirmedAnswers: z.record(z.string(), z.unknown()),
    intentSource: z.enum(["interactive", "ci-assumed", "pre-committed"]),
    snapshotRef: z.string().optional(),
});

export interface IntentArtifactResult {
    found: true;
    artifact: DeclaredIntentArtifact;
    path: string;
}

export interface IntentArtifactMissing {
    found: false;
}

export type ReadIntentResult = IntentArtifactResult | IntentArtifactMissing;

export async function readIntentArtifact(
    repoRoot: string,
): Promise<ReadIntentResult> {
    const artifactRelPath = `${ARTIFACT_DIR}/${ARTIFACT_FILENAME}`;
    const artifactPath = resolve(repoRoot, ARTIFACT_DIR, ARTIFACT_FILENAME);

    let raw: string;
    try {
        raw = await readTextWithinRoot(
            repoRoot,
            artifactRelPath,
            MAX_INTENT_BYTES,
        );
    } catch {
        return { found: false };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { found: false };
    }

    const result = DeclaredIntentSchema.safeParse(parsed);
    if (!result.success) {
        return { found: false };
    }

    return { found: true, artifact: result.data, path: artifactPath };
}

export async function writeIntentArtifact(
    repoRoot: string,
    artifact: DeclaredIntentArtifact,
): Promise<string> {
    const artifactPath = await resolveSafePath(
        repoRoot,
        `${ARTIFACT_DIR}/${ARTIFACT_FILENAME}`,
    );
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf-8");
    return artifactPath;
}

export function buildDefaultIntent(
    harnesses: HarnessName[],
): DeclaredIntentArtifact {
    return {
        targetHarnesses: harnesses.filter((h) => h !== "shared"),
        desiredCapabilities: [],
        confirmedAnswers: {},
        intentSource: "ci-assumed",
    };
}
