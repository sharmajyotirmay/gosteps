import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PathError, ensureWorkspace, listModules, readText, removePath, safePath, scaffoldProblem, tree, writeText } from "./workspace";

const root = mkdtempSync(join(tmpdir(), "gosteps-ws-"));
const outside = mkdtempSync(join(tmpdir(), "gosteps-outside-"));
writeFileSync(join(outside, "secret.txt"), "website secret");
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("workspace", () => {
  it("creates the default modules", async () => {
    await ensureWorkspace(root);
    expect(await listModules(root)).toEqual(["dsa-go", "jobq"]);
  });

  it.each(["../x", "/etc/passwd", "jobq/../../x", "jobq/.git/config", ".env", "jobq\\..\\x", "jobq//main.go", "jobq/a\0b"])("rejects path %j", (p) => {
    expect(() => safePath(root, p)).toThrow(PathError);
  });

  it("reads and writes source files inside a module", async () => {
    await writeText(root, "jobq/cmd/jobq/main.go", "package main\n");
    expect(await readText(root, "jobq/cmd/jobq/main.go")).toBe("package main\n");
    expect((await tree(root, "jobq")).map((e) => e.path)).toContain("jobq/cmd/jobq/main.go");
  });

  it("refuses non-source files and oversized files", async () => {
    await expect(writeText(root, "jobq/run.sh", "echo hi")).rejects.toThrow(PathError);
    await expect(writeText(root, "jobq/big.go", "x".repeat(1024 * 1024 + 1))).rejects.toThrow(PathError);
  });

  it("refuses to follow symlinks out of the workspace", async () => {
    mkdirSync(join(root, "jobq", "linkdir"), { recursive: true });
    symlinkSync(join(outside, "secret.txt"), join(root, "jobq", "linkdir", "secret.txt"));
    symlinkSync(outside, join(root, "jobq", "out"));
    await expect(readText(root, "jobq/linkdir/secret.txt")).rejects.toThrow(PathError);
    await expect(writeText(root, "jobq/out/evil.go", "package x")).rejects.toThrow(PathError);
    expect((await tree(root, "jobq")).some((e) => e.path.includes("secret") || e.path === "jobq/out")).toBe(false);
  });

  it("won't delete a whole module", async () => {
    await expect(removePath(root, "jobq")).rejects.toThrow(PathError);
  });

  it("scaffolds a DSA problem package without overwriting", async () => {
    const f = await scaffoldProblem(root, "dsa-go", "t01-hashing/two_sum", "two_sum", "Two Sum", "https://leetcode.com/problems/two-sum/");
    expect(f).toBe("dsa-go/t01-hashing/two_sum/solution.go");
    await writeText(root, f, "package two_sum\n// mine\n");
    await scaffoldProblem(root, "dsa-go", "t01-hashing/two_sum", "two_sum", "Two Sum", "");
    expect(await readText(root, f)).toContain("// mine");
  });
});
