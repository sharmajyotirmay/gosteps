import { describe, expect, it } from "vitest";
import { RunError, dockerArgs, goCommand, parseRunRequest } from "./sandbox";

const opts = { moduleDir: "/ws/jobq", uid: 501, gid: 20, name: "gosteps-run-x" };

describe("parseRunRequest", () => {
  it("fills safe defaults", () => {
    expect(parseRunRequest({ module: "jobq", action: "test" })).toMatchObject({ pkg: "./...", race: false, count: null });
    expect(parseRunRequest({ module: "jobq", action: "run" }).pkg).toBe(".");
  });

  it.each([
    [{ module: "jobq", action: "sh" }, "unknown action"],
    [{ module: "../etc", action: "test" }, "bad module"],
    [{ module: "jobq", action: "test", pkg: "../other/..." }, "bad package"],
    [{ module: "jobq", action: "test", pkg: "./a/../../x" }, "bad package"],
    [{ module: "jobq", action: "test", pkg: "./...; rm -rf /" }, "bad package"],
    [{ module: "jobq", action: "test", run: "x`id`" }, "bad -run"],
    [{ module: "jobq", action: "test", run: "a b" }, "bad -run"],
    [{ module: "jobq", action: "test", count: 999 }, "count"],
  ])("rejects %j", (input, msg) => {
    expect(() => parseRunRequest(input)).toThrow(RunError);
    expect(() => parseRunRequest(input)).toThrow(msg);
  });
});

describe("goCommand", () => {
  it("builds go test flags from the allowlist only", () => {
    const r = parseRunRequest({ module: "jobq", action: "test", race: true, cover: true, verbose: true, run: "TestPool|TestStop", pkg: "./internal/..." });
    expect(goCommand(r)).toEqual(["go", "test", "-race", "-cover", "-v", "-run", "TestPool|TestStop", "-count=1", "./internal/..."]);
  });
  it("benchmarks skip unit tests unless -run is given", () => {
    expect(goCommand(parseRunRequest({ module: "jobq", action: "test", bench: "." }))).toEqual(["go", "test", "-bench", ".", "-benchmem", "-run", "^$", "-count=1", "./..."]);
  });
});

describe("dockerArgs", () => {
  const args = dockerArgs(parseRunRequest({ module: "jobq", action: "test", race: true }), opts);
  const has = (...xs: string[]) => args.join(" ").includes(xs.join(" "));

  it("locks the container down", () => {
    expect(has("--network", "none")).toBe(true);
    expect(args).toContain("--read-only");
    expect(has("--cap-drop", "ALL")).toBe(true);
    expect(has("--security-opt", "no-new-privileges")).toBe(true);
    expect(has("--user", "501:20")).toBe(true);
    expect(has("--pids-limit", "256")).toBe(true);
    expect(has("--memory", "1g")).toBe(true);
    expect(args).toContain("--rm");
    expect(has("GOPROXY=off")).toBe(true);
  });

  it("mounts only the one module, and the module cache read-only", () => {
    const mounts = args.filter((_, i) => args[i - 1] === "-v");
    expect(mounts).toEqual(["/ws/jobq:/src:rw", "gosteps-gocache:/cache/build:rw", "gosteps-gomod:/cache/mod:ro"]);
  });

  it("only `tidy` gets network, and it doesn't run your code", () => {
    const tidy = dockerArgs(parseRunRequest({ module: "jobq", action: "tidy" }), opts);
    expect(tidy.join(" ")).toContain("--network bridge");
    expect(tidy.slice(-3)).toEqual(["go", "mod", "tidy"]);
    for (const a of ["run", "test", "vet", "fmt", "build"] as const) {
      expect(dockerArgs(parseRunRequest({ module: "jobq", action: a }), opts).join(" ")).toContain("--network none");
    }
  });
});
