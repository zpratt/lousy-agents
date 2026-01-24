/**
 * Use case for generating Copilot Setup Steps workflow content.
 * This module handles the transformation of setup step candidates
 * into GitHub Actions workflow YAML.
 */

import {
    type GeneratedWorkflowTypes,
    NormalJob,
    Step,
    Workflow,
} from "@github-actions-workflow-ts/lib";
import { Scalar, stringify as stringifyYaml } from "yaml";
import type {
    ResolvedVersion,
    SetupStepCandidate,
} from "../entities/copilot-setup.js";
import type { ActionVersionGateway } from "../gateways/action-version-gateway.js";
import { createActionVersionGateway } from "../gateways/action-version-gateway.js";
import {
    findResolvedVersion,
    VERSION_PLACEHOLDER,
} from "./action-resolution.js";

/**
 * Extended step props type that supports YAML Scalar values for the 'uses' field.
 *
 * The @github-actions-workflow-ts/lib Step constructor accepts YAML Scalar objects
 * at runtime (verified by tests), enabling YAML comments on action references.
 * TypeScript types only declare string, so we extend the type to be explicit
 * about this runtime capability.
 *
 * @see buildUsesValue for where Scalar values are created
 * @see tests in copilot-setup.test.ts "SHA-pinned" for runtime verification
 */
type StepPropsWithScalar = Omit<GeneratedWorkflowTypes.Step, "uses"> & {
    uses: string | Scalar;
};

/**
 * Options for converting candidates to steps
 */
interface CandidateToStepOptions {
    /** Whether to use placeholder versions instead of actual versions */
    usePlaceholders?: boolean;
    /** Resolved versions to use for SHA-pinning */
    resolvedVersions?: ResolvedVersion[];
}

/**
 * Options for workflow content generation
 */
export interface GenerateWorkflowOptions {
    /** Whether to use placeholder versions instead of gateway versions */
    usePlaceholders?: boolean;
    /** Resolved versions to use for SHA-pinning */
    resolvedVersions?: ResolvedVersion[];
}

/**
 * Generates a human-readable step name from an action name
 * @example "actions/setup-node" -> "Setup node"
 * @example "jdx/mise-action" -> "Setup mise"
 */
function generateStepName(actionName: string): string {
    const name = actionName.split("/").pop() || actionName;
    return `Setup ${name.replace("setup-", "").replace("-action", "")}`;
}

/**
 * Gets the version string for an action based on options.
 * Priority: resolved version > candidate version > placeholder
 */
function getVersionForAction(
    action: string,
    candidateVersion: string | undefined,
    options?: CandidateToStepOptions,
): string {
    if (options?.resolvedVersions) {
        const resolved = findResolvedVersion(action, options.resolvedVersions);
        if (resolved) {
            return resolved.sha;
        }
    }

    if (options?.usePlaceholders) {
        return VERSION_PLACEHOLDER;
    }

    return candidateVersion || "";
}

/**
 * Builds the 'uses' value for a step, returning a YAML Scalar with comment
 * when the action has a resolved version, or a plain string otherwise.
 *
 * Note: The Step constructor from @github-actions-workflow-ts/lib accepts both
 * string and Scalar at runtime, even though its TypeScript types only declare string.
 * We use type casts when passing the return value to Step to work around this.
 *
 * @param action The action name (e.g., "actions/setup-node")
 * @param version The version string (SHA or version tag)
 * @param options Optional conversion options for resolved versions
 * @returns Either a Scalar with comment (for SHA-pinned) or a plain string
 */
function buildUsesValue(
    action: string,
    version: string,
    options?: CandidateToStepOptions,
): string | Scalar {
    const uses = version ? `${action}@${version}` : action;

    if (options?.resolvedVersions) {
        const resolved = findResolvedVersion(action, options.resolvedVersions);
        if (resolved) {
            const scalar = new Scalar(uses);
            scalar.comment = ` ${resolved.versionTag}`;
            return scalar;
        }
    }

    return uses;
}

/**
 * Builds a Step object from a SetupStepCandidate
 * @param candidate The candidate to convert to a Step
 * @param options Optional conversion options for placeholders and resolved versions
 * @returns A typed Step object
 */
function buildStepFromCandidate(
    candidate: SetupStepCandidate,
    options?: CandidateToStepOptions,
): Step {
    const version = getVersionForAction(
        candidate.action,
        candidate.version,
        options,
    );
    const usesValue = buildUsesValue(candidate.action, version, options);
    const withConfig =
        candidate.config && Object.keys(candidate.config).length > 0
            ? candidate.config
            : undefined;

    const stepProps: StepPropsWithScalar = {
        name: generateStepName(candidate.action),
        uses: usesValue,
        with: withConfig,
    };
    return new Step(stepProps as GeneratedWorkflowTypes.Step);
}

/**
 * Converts an array of SetupStepCandidate to typed Step objects
 * @param candidates The setup step candidates to convert
 * @param options Optional conversion options for placeholders and resolved versions
 * @returns Array of typed Step objects
 */
function buildStepsFromCandidates(
    candidates: SetupStepCandidate[],
    options?: CandidateToStepOptions,
): Step[] {
    return candidates.map((candidate) =>
        buildStepFromCandidate(candidate, options),
    );
}

/**
 * Appends missing setup steps to an existing workflow's job steps array
 * @param steps The existing steps array to append to
 * @param missingCandidates The candidates to add as new steps
 * @param options Optional conversion options for placeholders and resolved versions
 */
function appendMissingStepsToJob(
    steps: unknown[],
    missingCandidates: SetupStepCandidate[],
    options?: CandidateToStepOptions,
): void {
    for (const candidate of missingCandidates) {
        const newStep = buildStepFromCandidate(candidate, options);
        steps.push(newStep.step);
    }
}

/**
 * Gets the checkout version based on resolved versions, placeholders, or gateway.
 * Reduces duplication by centralizing the version resolution logic.
 */
async function getCheckoutVersion(
    versionGateway: ActionVersionGateway,
    options?: GenerateWorkflowOptions,
): Promise<string> {
    if (options?.resolvedVersions) {
        const resolved = findResolvedVersion(
            "actions/checkout",
            options.resolvedVersions,
        );
        if (resolved) {
            return resolved.sha;
        }
    }

    if (options?.usePlaceholders) {
        return VERSION_PLACEHOLDER;
    }

    return (await versionGateway.getVersion("actions/checkout")) || "v4";
}

/**
 * Generates the Copilot Setup Steps workflow content using typed workflow builder
 * @param candidates The setup step candidates to include
 * @param versionGateway Optional gateway for looking up action versions (defaults to local)
 * @param options Optional generation options for placeholders and resolved versions
 * @returns The workflow YAML content as a string
 */
export async function generateWorkflowContent(
    candidates: SetupStepCandidate[],
    versionGateway: ActionVersionGateway = createActionVersionGateway(),
    options?: GenerateWorkflowOptions,
): Promise<string> {
    const stepOptions: CandidateToStepOptions = {
        usePlaceholders: options?.usePlaceholders,
        resolvedVersions: options?.resolvedVersions,
    };

    const checkoutVersion = await getCheckoutVersion(versionGateway, options);
    const checkoutUsesValue = buildUsesValue(
        "actions/checkout",
        checkoutVersion,
        stepOptions,
    );
    const checkoutStepProps: StepPropsWithScalar = {
        name: "Checkout code",
        uses: checkoutUsesValue,
    };
    const steps: Step[] = [
        new Step(checkoutStepProps as GeneratedWorkflowTypes.Step),
        ...buildStepsFromCandidates(candidates, stepOptions),
    ];

    const job = new NormalJob("copilot-setup-steps", {
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 30,
        permissions: {
            "id-token": "write",
            contents: "read",
        },
    }).addSteps(steps);

    const workflow = new Workflow("copilot-setup-steps.yml", {
        name: "Copilot Setup Steps",
        on: {
            workflow_dispatch: {},
            push: {
                branches: ["main"],
                paths: [".github/workflows/copilot-setup-steps.yml"],
            },
            pull_request: {
                branches: ["main"],
                paths: [".github/workflows/copilot-setup-steps.yml"],
            },
        },
    }).addJob(job);

    return `---\n${stringifyYaml(workflow.workflow, { lineWidth: 0 })}`;
}

/**
 * Updates an existing workflow by appending missing setup steps
 * @param existingWorkflow The parsed existing workflow
 * @param missingCandidates Candidates to add to the workflow
 * @param versionGateway Optional gateway for looking up action versions (defaults to local)
 * @param options Optional generation options for placeholders and resolved versions
 * @returns The updated workflow YAML content
 */
export async function updateWorkflowWithMissingSteps(
    existingWorkflow: unknown,
    missingCandidates: SetupStepCandidate[],
    versionGateway: ActionVersionGateway = createActionVersionGateway(),
    options?: GenerateWorkflowOptions,
): Promise<string> {
    if (!existingWorkflow || typeof existingWorkflow !== "object") {
        return generateWorkflowContent(
            missingCandidates,
            versionGateway,
            options,
        );
    }

    const workflow = JSON.parse(JSON.stringify(existingWorkflow)) as Record<
        string,
        unknown
    >;

    const jobs = workflow.jobs as Record<string, unknown> | undefined;
    if (!jobs) {
        return generateWorkflowContent(
            missingCandidates,
            versionGateway,
            options,
        );
    }

    const jobNames = Object.keys(jobs);
    if (jobNames.length === 0) {
        return generateWorkflowContent(
            missingCandidates,
            versionGateway,
            options,
        );
    }

    const mainJobName = jobNames[0];
    const mainJob = jobs[mainJobName] as Record<string, unknown>;

    if (!mainJob || !Array.isArray(mainJob.steps)) {
        return generateWorkflowContent(
            missingCandidates,
            versionGateway,
            options,
        );
    }

    const stepOptions: CandidateToStepOptions = {
        usePlaceholders: options?.usePlaceholders,
        resolvedVersions: options?.resolvedVersions,
    };
    appendMissingStepsToJob(
        mainJob.steps as unknown[],
        missingCandidates,
        stepOptions,
    );

    return `---\n${stringifyYaml(workflow, { lineWidth: 0 })}`;
}
