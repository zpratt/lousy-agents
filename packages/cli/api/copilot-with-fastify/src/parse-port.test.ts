import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePort } from "./parse-port.js";

describe("parsePort", () => {
    describe("when value is undefined", () => {
        it("should return default port 3000", () => {
            const result = parsePort(undefined);

            expect(result).toBe(3000);
        });
    });

    describe("when value is empty string", () => {
        it("should return default port 3000", () => {
            const result = parsePort("");

            expect(result).toBe(3000);
        });
    });

    describe("when value is a valid unprivileged port", () => {
        it("should return the parsed port", () => {
            const result = parsePort("8080");

            expect(result).toBe(8080);
        });
    });

    describe("when value is invalid", () => {
        let warnSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        });

        afterEach(() => {
            warnSpy.mockRestore();
        });

        it("should warn and return default for non-numeric value", () => {
            const result = parsePort("abc");

            expect(result).toBe(3000);
            expect(warnSpy).toHaveBeenCalledWith(
                'Invalid PORT "abc", using default 3000',
            );
        });

        it("should warn and return default for privileged port", () => {
            const result = parsePort("80");

            expect(result).toBe(3000);
            expect(warnSpy).toHaveBeenCalledWith(
                'Invalid PORT "80", using default 3000',
            );
        });

        it("should warn and return default for port above max", () => {
            const result = parsePort("70000");

            expect(result).toBe(3000);
            expect(warnSpy).toHaveBeenCalledWith(
                'Invalid PORT "70000", using default 3000',
            );
        });

        it("should warn and return default for non-integer port", () => {
            const result = parsePort("3000.5");

            expect(result).toBe(3000);
            expect(warnSpy).toHaveBeenCalledWith(
                'Invalid PORT "3000.5", using default 3000',
            );
        });
    });

    describe("when value is not provided or empty", () => {
        let warnSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        });

        afterEach(() => {
            warnSpy.mockRestore();
        });

        it("should not warn when value is undefined", () => {
            parsePort(undefined);

            expect(warnSpy).not.toHaveBeenCalled();
        });

        it("should not warn when value is empty string", () => {
            parsePort("");

            expect(warnSpy).not.toHaveBeenCalled();
        });
    });
});
