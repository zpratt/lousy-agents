import { describe, expect, it } from "vitest";
import {
    describeByteLimit,
    MAX_INSTRUCTION_FILE_BYTES,
} from "./file-limits.js";

const ONE_MIB = 1_048_576;

describe("MAX_INSTRUCTION_FILE_BYTES", () => {
    it("should be one mebibyte", () => {
        expect(MAX_INSTRUCTION_FILE_BYTES).toBe(ONE_MIB);
    });
});

describe("describeByteLimit", () => {
    it("should name a whole number of mebibytes in mebibytes", () => {
        expect(describeByteLimit(ONE_MIB)).toBe("1 MiB");
        expect(describeByteLimit(3 * ONE_MIB)).toBe("3 MiB");
    });

    it("should name any other limit in bytes, so the text never rounds the limit", () => {
        expect(describeByteLimit(ONE_MIB + 1)).toBe("1048577 bytes");
        expect(describeByteLimit(1_000)).toBe("1000 bytes");
    });

    it("should describe the instruction file limit the way the advisories do", () => {
        expect(describeByteLimit(MAX_INSTRUCTION_FILE_BYTES)).toBe("1 MiB");
    });
});
