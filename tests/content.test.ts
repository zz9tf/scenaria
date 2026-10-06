import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAllPackages, loadPackage } from "@/content/loader";
import { validatePackage } from "@/content/validator";
import type { ContentPackage } from "@/content/types";
import { ContentValidationError } from "@/engine/errors";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "packages");

describe("content loader", () => {
  it("loads and validates the shipped engine-test package", async () => {
    const packages = await loadAllPackages();
    const pkg = packages.get("engine-test");
    expect(pkg).toBeDefined();
    expect(validatePackage(pkg as ContentPackage)).toEqual([]);
    expect(pkg?.scenarios.size).toBe(3);
    expect(pkg?.characters.size).toBe(3);
    expect(pkg?.relationships.size).toBe(3);
  });

  it("refuses a manifest whose id does not match its directory", async () => {
    await expect(loadPackage("mismatched-id", FIXTURES)).rejects.toThrow(ContentValidationError);
  });

  it("refuses a file that fails its schema", async () => {
    await expect(loadPackage("bad-schema", FIXTURES)).rejects.toThrow(ContentValidationError);
  });
});

describe("content validator", () => {
  it("reports every broken reference in one pass", async () => {
    const pkg = await loadPackage("broken-refs", FIXTURES);
    const issues = validatePackage(pkg);
    const messages = issues.map((issue) => `${issue.path} :: ${issue.message}`);

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unknown character 'ghost'"),
        expect.stringContaining("unknown condition type 'vibes_check'"),
        expect.stringContaining("unknown effect type 'teleport'"),
        expect.stringContaining("unknown goal 'no_such_goal'"),
        expect.stringContaining("unknown evaluator 'no_such_evaluator'"),
        expect.stringContaining("unknown scenario 'no_such_scenario'"),
        expect.stringContaining("goal owner 'stranger' is not a participant"),
      ]),
    );
  });

  it("reports an invalid state path in an effect", async () => {
    const pkg = await loadPackage("broken-refs", FIXTURES);
    const issues = validatePackage(pkg);
    expect(issues.some((issue) => issue.message.includes("state path must start with"))).toBe(true);
  });
});
