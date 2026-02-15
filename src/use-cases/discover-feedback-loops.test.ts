import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type {
	DiscoveredScript,
	DiscoveredTool,
} from "../entities/feedback-loop.js";
import type { PackageManagerFile } from "../entities/copilot-setup.js";
import type { ScriptDiscoveryGateway } from "../gateways/script-discovery-gateway.js";
import type { ToolDiscoveryGateway } from "../gateways/tool-discovery-gateway.js";
import {
	DiscoverFeedbackLoopsUseCase,
	type PackageManagerGateway,
} from "./discover-feedback-loops.js";

const chance = new Chance();

describe("DiscoverFeedbackLoopsUseCase", () => {
	describe("when target directory is not provided", () => {
		it("should throw an error", async () => {
			const scriptGateway: ScriptDiscoveryGateway = {
				discoverScripts: vi.fn(),
			};
			const toolGateway: ToolDiscoveryGateway = {
				discoverTools: vi.fn(),
			};
			const packageManagerGateway: PackageManagerGateway = {
				detectPackageManagers: vi.fn(),
			};

			const useCase = new DiscoverFeedbackLoopsUseCase(
				scriptGateway,
				toolGateway,
				packageManagerGateway,
			);

			await expect(useCase.execute({ targetDir: "" })).rejects.toThrow(
				"Target directory is required",
			);
		});
	});

	describe("when discovering feedback loops", () => {
		it("should combine scripts and tools from all sources", async () => {
			const targetDir = `/tmp/${chance.guid()}`;

			const mockScripts: DiscoveredScript[] = [
				{
					name: "test",
					command: "vitest run",
					phase: "test",
					isMandatory: true,
				},
				{
					name: "build",
					command: "rspack build",
					phase: "build",
					isMandatory: true,
				},
			];

			const mockTools: DiscoveredTool[] = [
				{
					name: "npm",
					fullCommand: "npm ci",
					phase: "install",
					isMandatory: false,
					sourceWorkflow: "ci.yml",
				},
				{
					name: "mise run lint",
					fullCommand: "mise run lint",
					phase: "lint",
					isMandatory: true,
					sourceWorkflow: "ci.yml",
				},
			];

			const mockPackageManagers: PackageManagerFile[] = [
				{
					type: "npm",
					filename: "package.json",
					lockfile: "package-lock.json",
				},
			];

			const scriptGateway: ScriptDiscoveryGateway = {
				discoverScripts: vi.fn().mockResolvedValue(mockScripts),
			};
			const toolGateway: ToolDiscoveryGateway = {
				discoverTools: vi.fn().mockResolvedValue(mockTools),
			};
			const packageManagerGateway: PackageManagerGateway = {
				detectPackageManagers: vi.fn().mockResolvedValue(mockPackageManagers),
			};

			const useCase = new DiscoverFeedbackLoopsUseCase(
				scriptGateway,
				toolGateway,
				packageManagerGateway,
			);

			const result = await useCase.execute({ targetDir });

			expect(scriptGateway.discoverScripts).toHaveBeenCalledWith(targetDir);
			expect(toolGateway.discoverTools).toHaveBeenCalledWith(targetDir);
			expect(packageManagerGateway.detectPackageManagers).toHaveBeenCalledWith(
				targetDir,
			);

			expect(result.feedbackLoops.scripts).toHaveLength(2);
			expect(result.feedbackLoops.tools).toHaveLength(2);
			expect(result.feedbackLoops.packageManager).toBe("npm");
		});

		it("should sort scripts and tools by phase priority", async () => {
			const targetDir = `/tmp/${chance.guid()}`;

			const mockScripts: DiscoveredScript[] = [
				{
					name: "deploy",
					command: "npm publish",
					phase: "deploy",
					isMandatory: false,
				},
				{
					name: "test",
					command: "vitest run",
					phase: "test",
					isMandatory: true,
				},
				{
					name: "build",
					command: "rspack build",
					phase: "build",
					isMandatory: true,
				},
				{
					name: "lint",
					command: "biome check",
					phase: "lint",
					isMandatory: true,
				},
			];

			const scriptGateway: ScriptDiscoveryGateway = {
				discoverScripts: vi.fn().mockResolvedValue(mockScripts),
			};
			const toolGateway: ToolDiscoveryGateway = {
				discoverTools: vi.fn().mockResolvedValue([]),
			};
			const packageManagerGateway: PackageManagerGateway = {
				detectPackageManagers: vi.fn().mockResolvedValue([]),
			};

			const useCase = new DiscoverFeedbackLoopsUseCase(
				scriptGateway,
				toolGateway,
				packageManagerGateway,
			);

			const result = await useCase.execute({ targetDir });

			// Scripts should be sorted: test, lint, format, build, security, install, dev, deploy, unknown
			const scriptPhases = result.feedbackLoops.scripts.map((s) => s.phase);
			expect(scriptPhases).toEqual(["test", "lint", "build", "deploy"]);
		});

		it("should handle no package manager detected", async () => {
			const targetDir = `/tmp/${chance.guid()}`;

			const scriptGateway: ScriptDiscoveryGateway = {
				discoverScripts: vi.fn().mockResolvedValue([]),
			};
			const toolGateway: ToolDiscoveryGateway = {
				discoverTools: vi.fn().mockResolvedValue([]),
			};
			const packageManagerGateway: PackageManagerGateway = {
				detectPackageManagers: vi.fn().mockResolvedValue([]),
			};

			const useCase = new DiscoverFeedbackLoopsUseCase(
				scriptGateway,
				toolGateway,
				packageManagerGateway,
			);

			const result = await useCase.execute({ targetDir });

			expect(result.feedbackLoops.packageManager).toBeUndefined();
		});
	});
});
