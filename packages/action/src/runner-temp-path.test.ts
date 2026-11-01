import { describe, expect, it } from "vitest";
import { validateRunnerTempPath } from "./runner-temp-path.js";

const RUNNER_TEMP = "/home/runner/work/_temp";
const VARIABLE = "THE_VAR";

describe("validateRunnerTempPath messages", () => {
    it.each([
        ["is relative", "lousy-agents-annotations", "must be an absolute path"],
        [
            "contains a NUL byte",
            `${RUNNER_TEMP}/a\0b`,
            "must not contain a NUL byte",
        ],
        [
            "has a traversal segment",
            `${RUNNER_TEMP}/../etc/passwd`,
            "must not contain a traversal segment",
        ],
        [
            "has a traversal segment that returns inside",
            `${RUNNER_TEMP}/a/../b`,
            "must not contain a traversal segment",
        ],
        ["is outside RUNNER_TEMP", "/etc/passwd", "must be inside RUNNER_TEMP"],
        ["is RUNNER_TEMP itself", RUNNER_TEMP, "must be inside RUNNER_TEMP"],
        [
            "only shares RUNNER_TEMP as a prefix",
            `${RUNNER_TEMP}-evil/file`,
            "must be inside RUNNER_TEMP",
        ],
    ])(
        "should name the variable, the rule and the value for a path that %s",
        (_label, path, rule) => {
            expect(() =>
                validateRunnerTempPath(path, RUNNER_TEMP, VARIABLE),
            ).toThrow(
                new Error(`${VARIABLE} ${rule}: ${JSON.stringify(path)}`),
            );
        },
    );

    it.each([undefined, "", "relative/tmp"])(
        "should say RUNNER_TEMP cannot anchor the path when RUNNER_TEMP is %j",
        (runnerTemp) => {
            expect(() =>
                validateRunnerTempPath("/tmp/file", runnerTemp, VARIABLE),
            ).toThrow(
                new Error(
                    `${VARIABLE} is set but RUNNER_TEMP is missing or not an absolute path`,
                ),
            );
        },
    );
});
