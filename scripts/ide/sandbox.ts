import { spawn, type ChildProcess } from "node:child_process";

// Runs Go commands in throwaway, locked-down Docker containers. Nothing here ever goes through
// a shell: commands are built as argv arrays from an allowlist, and every input is validated.

export const IMAGE = process.env.GOSTEPS_GO_IMAGE ?? "golang:1.26-bookworm";
export const VOLUMES = { build: "gosteps-gocache", mod: "gosteps-gomod" } as const;
export const LABEL = "gosteps=sandbox";

export const ACTIONS = ["run", "test", "vet", "fmt", "build", "tidy"] as const;
export type Action = (typeof ACTIONS)[number];

export interface RunRequest {
  module: string;
  action: Action;
  pkg: string;
  race: boolean;
  cover: boolean;
  verbose: boolean;
  json: boolean;
  run: string | null;
  bench: string | null;
  count: number | null;
}

export class RunError extends Error {}

const MODULE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PKG = /^\.(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*(\/\.\.\.)?$/; // ".", "./...", "./cmd/jobq", "./internal/..."
const PATTERN = /^[A-Za-z0-9_|^$.*+?()[\]/-]{1,120}$/; // -run / -bench regex (passed as one argv item)

/** Validate untrusted JSON from the browser into a RunRequest. */
export function parseRunRequest(raw: unknown): RunRequest {
  const r = (raw ?? {}) as Record<string, unknown>;
  const action = r.action as Action;
  if (!ACTIONS.includes(action)) throw new RunError("unknown action");
  if (typeof r.module !== "string" || !MODULE.test(r.module)) throw new RunError("bad module");
  const pkg = typeof r.pkg === "string" && r.pkg ? r.pkg : action === "run" ? "." : "./...";
  if (!PKG.test(pkg) || pkg.split("/").includes("..")) throw new RunError("bad package pattern");
  const pat = (v: unknown) => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || !PATTERN.test(v)) throw new RunError("bad -run/-bench pattern");
    return v;
  };
  const count = r.count === undefined || r.count === null ? null : Number(r.count);
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 20)) throw new RunError("count must be 1–20");
  return {
    module: r.module,
    action,
    pkg,
    race: r.race === true,
    cover: r.cover === true,
    verbose: r.verbose === true,
    json: r.json === true,
    run: pat(r.run),
    bench: pat(r.bench),
    count,
  };
}

/** The command that runs inside the container. */
export function goCommand(r: RunRequest): string[] {
  switch (r.action) {
    case "run":
      return ["go", "run", r.pkg];
    case "vet":
      return ["go", "vet", r.pkg];
    case "fmt":
      return ["gofmt", "-l", "-w", "."];
    case "build":
      return ["go", "build", "-o", "/tmp/bin/", r.pkg];
    case "tidy":
      return ["go", "mod", "tidy"];
    case "test": {
      const a = ["go", "test"];
      if (r.race) a.push("-race");
      if (r.cover) a.push("-cover");
      if (r.verbose) a.push("-v");
      if (r.json) a.push("-json");
      if (r.run) a.push("-run", r.run);
      if (r.bench) a.push("-bench", r.bench, "-benchmem");
      if (r.bench && !r.run) a.push("-run", "^$");
      a.push(`-count=${r.count ?? 1}`);
      a.push(r.pkg);
      return a;
    }
  }
}

export interface SandboxOptions {
  moduleDir: string;
  uid: number;
  gid: number;
  name: string;
}

/**
 * docker run arguments. Isolation, layer by layer:
 *  - only this one module directory is mounted (not the workspace, never the website's source);
 *  - no network, except `tidy`, which downloads modules and never executes your code;
 *  - read-only root filesystem; writable /tmp is a size-capped tmpfs;
 *  - all Linux capabilities dropped, no privilege escalation, runs as your uid (not root);
 *  - memory, CPU, and process-count limits; removed when it exits; killed on timeout.
 */
export function dockerArgs(r: RunRequest, o: SandboxOptions): string[] {
  const online = r.action === "tidy";
  return [
    "run", "--rm",
    "--name", o.name,
    "--label", LABEL,
    "--network", online ? "bridge" : "none",
    "--read-only",
    "--tmpfs", "/tmp:rw,exec,nosuid,size=512m",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", "256",
    "--memory", "1g", "--memory-swap", "1g",
    "--cpus", "2",
    "--user", `${o.uid}:${o.gid}`,
    "--workdir", "/src",
    "-v", `${o.moduleDir}:/src:rw`,
    "-v", `${VOLUMES.build}:/cache/build:rw`,
    "-v", `${VOLUMES.mod}:/cache/mod:${online ? "rw" : "ro"}`,
    "-e", "HOME=/tmp",
    "-e", "GOPATH=/tmp/gopath",
    "-e", "GOCACHE=/cache/build",
    "-e", "GOMODCACHE=/cache/mod",
    "-e", "GOTOOLCHAIN=local",
    "-e", "GOFLAGS=-modcacherw",
    "-e", `GOPROXY=${online ? "https://proxy.golang.org,direct" : "off"}`,
    IMAGE,
    ...goCommand(r),
  ];
}

export const TIMEOUT_MS: Record<Action, number> = { run: 60_000, test: 180_000, vet: 120_000, fmt: 30_000, build: 120_000, tidy: 180_000 };

export function docker(args: string[], opts: { timeoutMs?: number } = {}): Promise<{ code: number; out: string }> {
  return new Promise((ok) => {
    const p = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    const t = opts.timeoutMs ? setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs) : undefined;
    p.on("error", (e) => ok({ code: -1, out: String(e) }));
    p.on("close", (code) => {
      clearTimeout(t);
      ok({ code: code ?? -1, out });
    });
  });
}

export async function dockerStatus() {
  const v = await docker(["version", "--format", "{{.Server.Version}}"], { timeoutMs: 5000 });
  if (v.code !== 0) return { available: false, version: null, imageReady: false };
  const img = await docker(["image", "inspect", "--format", "{{.Id}}", IMAGE], { timeoutMs: 5000 });
  return { available: true, version: v.out.trim(), imageReady: img.code === 0 };
}

/** Pull the image, create the cache volumes, and hand them to the runner's uid. */
export function setupCommands(uid: number, gid: number): string[][] {
  return [
    ["pull", IMAGE],
    ["volume", "create", VOLUMES.build],
    ["volume", "create", VOLUMES.mod],
    ["run", "--rm", "--network", "none", "-v", `${VOLUMES.build}:/cache/build`, "-v", `${VOLUMES.mod}:/cache/mod`, IMAGE, "chown", "-R", `${uid}:${gid}`, "/cache"],
  ];
}

export function spawnStreaming(args: string[]): ChildProcess {
  return spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
}
