import { join } from "node:path";
import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { BoundedReadFailure } from "../gateways/read-regular-file-no-follow.js";
import type { PathInspection } from "../gateways/real-path-within-root.js";
import {
    type ImportLocationFailure,
    statusForReadFailure,
    toLocatedFile,
} from "./import-file-location.js";

const chance = new Chance();

const ROOT_REAL = join("/", "repo", chance.word());
const IDENTITY = { dev: chance.natural(), ino: chance.natural() };

function inspectionOf(kind: "file" | "directory"): PathInspection {
    return {
        status: "ok",
        kind,
        real: join(ROOT_REAL, "docs", "a.md"),
        identity: IDENTITY,
    };
}

describe("toLocatedFile", () => {
    it("should locate a regular file by its real path relative to the root", () => {
        expect(toLocatedFile(ROOT_REAL, inspectionOf("file"))).toEqual({
            ok: true,
            real: "docs/a.md",
            realAbsolute: join(ROOT_REAL, "docs", "a.md"),
            identity: IDENTITY,
        });
    });

    it.each<{
        description: string;
        inspection: PathInspection;
        status: ImportLocationFailure;
    }>([
        {
            description: "a path that does not exist",
            inspection: { status: "missing" },
            status: "unresolved",
        },
        {
            description:
                "a path that is neither a file nor a directory, or cannot be followed",
            inspection: { status: "unsupported" },
            status: "not-regular",
        },
        {
            description: "a path that leads outside the root",
            inspection: { status: "outside-root", kind: "file" },
            status: "symlink",
        },
        {
            description: "a directory",
            inspection: inspectionOf("directory"),
            status: "not-regular",
        },
        {
            description: "a path the system would not let the process look at",
            inspection: { status: "unreadable" },
            status: "unreadable",
        },
    ])("should report $description as $status", ({ inspection, status }) => {
        expect(toLocatedFile(ROOT_REAL, inspection)).toEqual({
            ok: false,
            status,
        });
    });
});

describe("statusForReadFailure", () => {
    it.each<{ reason: BoundedReadFailure; status: ImportLocationFailure }>([
        { reason: "symlink", status: "symlink" },
        { reason: "too-large", status: "size-exceeded" },
        { reason: "not-regular", status: "not-regular" },
        { reason: "hard-linked", status: "hard-linked" },
        { reason: "identity-mismatch", status: "unreadable" },
        { reason: "unreadable", status: "unreadable" },
    ])(
        "should report a read that failed as $reason as $status",
        ({ reason, status }) => {
            expect(statusForReadFailure(reason)).toBe(status);
        },
    );
});
