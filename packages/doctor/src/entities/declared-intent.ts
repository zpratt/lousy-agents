import type { HarnessName } from "./edge-types.js";

export type IntentSource = "interactive" | "ci-assumed" | "pre-committed";

export interface DeclaredIntentArtifact {
    targetHarnesses: HarnessName[];
    desiredCapabilities: string[];
    confirmedAnswers: Record<string, unknown>;
    intentSource: IntentSource;
    snapshotRef?: string;
}
