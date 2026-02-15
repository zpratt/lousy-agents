import { describe, expect, it } from "vitest";
import {
	determineScriptPhase,
	isScriptMandatory,
	type FeedbackLoopPhase,
} from "./feedback-loop.js";

describe("determineScriptPhase", () => {
	describe("when script name exactly matches a known pattern", () => {
		it("should return test phase for test script", () => {
			const result = determineScriptPhase("test", "vitest run");
			expect(result).toBe("test");
		});

		it("should return build phase for build script", () => {
			const result = determineScriptPhase("build", "rspack build");
			expect(result).toBe("build");
		});

		it("should return lint phase for lint script", () => {
			const result = determineScriptPhase("lint", "biome check");
			expect(result).toBe("lint");
		});

		it("should return format phase for format script", () => {
			const result = determineScriptPhase("format", "prettier --write");
			expect(result).toBe("format");
		});
	});

	describe("when script name starts with a known pattern", () => {
		it("should return test phase for test:unit", () => {
			const result = determineScriptPhase("test:unit", "vitest run");
			expect(result).toBe("test");
		});

		it("should return lint phase for lint:fix", () => {
			const result = determineScriptPhase("lint:fix", "biome check --write");
			expect(result).toBe("lint");
		});
	});

	describe("when script name is unknown but command contains hints", () => {
		it("should return test phase when command contains vitest", () => {
			const result = determineScriptPhase("check", "vitest run");
			expect(result).toBe("test");
		});

		it("should return test phase when command contains jest", () => {
			const result = determineScriptPhase("validate", "jest --coverage");
			expect(result).toBe("test");
		});

		it("should return build phase when command contains webpack", () => {
			const result = determineScriptPhase("bundle", "webpack --mode production");
			expect(result).toBe("build");
		});

		it("should return lint phase when command contains biome", () => {
			const result = determineScriptPhase("check", "biome check .");
			expect(result).toBe("lint");
		});

		it("should return format phase when command contains prettier", () => {
			const result = determineScriptPhase("fmt", "prettier --check .");
			expect(result).toBe("format");
		});

		it("should return security phase when command contains audit", () => {
			const result = determineScriptPhase("check-deps", "npm audit");
			expect(result).toBe("security");
		});
	});

	describe("when script cannot be categorized", () => {
		it("should return unknown phase", () => {
			const result = determineScriptPhase("custom", "echo hello");
			expect(result).toBe("unknown");
		});
	});
});

describe("isScriptMandatory", () => {
	const mandatoryPhases: FeedbackLoopPhase[] = [
		"test",
		"build",
		"lint",
		"format",
	];
	const nonMandatoryPhases: FeedbackLoopPhase[] = [
		"security",
		"deploy",
		"install",
		"dev",
		"unknown",
	];

	describe("when phase is mandatory", () => {
		it.each(mandatoryPhases)("should return true for %s", (phase) => {
			expect(isScriptMandatory(phase)).toBe(true);
		});
	});

	describe("when phase is not mandatory", () => {
		it.each(nonMandatoryPhases)("should return false for %s", (phase) => {
			expect(isScriptMandatory(phase)).toBe(false);
		});
	});
});
