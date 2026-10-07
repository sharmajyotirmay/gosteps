import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { IDE_HEADER, guardLocal, readBody, sendJson } from "./ide/local-http";
import { PathError, ensureWorkspace, listModules, readText, removePath, safePath, scaffoldProblem, tree, workspaceRoot, writeText } from "./ide/workspace";
import { IMAGE, LABEL, RunError, TIMEOUT_MS, docker, dockerArgs, dockerStatus, parseRunRequest, setupCommands, spawnStreaming } from "./ide/sandbox";

// GoSteps IDE runner: file access for the workspace + Go commands in a Docker sandbox.
// Binds to 127.0.0.1, answers only localhost pages, and requires the x-gosteps header.
//
//   GET    /health                    docker + image status, workspace path, modules
//   POST   /setup                     pull image, create caches, create default modules (NDJSON log)
//   GET    /tree?module=jobq          files in a module
//   GET    /file?path=jobq/main.go    read a file
//   PUT    /file?path=…               write a file (body = text)
//   DELETE /file?path=…               delete a file or folder inside a module
//   POST   /scaffold                  { module, dir, pkg, title, url } → creates a DSA problem package
//   POST   /run                       { module, action, pkg, race, cover, … } → NDJSON stream
//   POST   /stop                      { id } → kill a running sandbox

export const DEFAULT_PORT = 4778;
const MAX_RUNS = 2;
const MAX_OUTPUT = 2 * 1024 * 1024;

export function createIdeServer(opts: { root?: string; uid?: number; gid?: number } = {}): Server {
  const root = opts.root ?? workspaceRoot();
  const uid = opts.uid ?? process.getuid?.() ?? 1000;
  const gid = opts.gid ?? process.getgid?.() ?? 1000;
  const running = new Map<string, { child: ChildProcess; name: string }>();

  const server = createServer(async (req, res) => {
    if (guardLocal(req, res, { methods: "GET, PUT, POST, DELETE, OPTIONS", requireHeader: true, exempt: (p) => p === "/health" })) return;
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    try {
      if (req.method === "GET" && path === "/health") {
        await ensureWorkspace(root);
        return sendJson(res, 200, { ok: true, workspace: root, image: IMAGE, modules: await listModules(root), docker: await dockerStatus() });
      }

      if (req.method === "GET" && path === "/tree") {
        return sendJson(res, 200, { entries: await tree(root, url.searchParams.get("module") ?? "") });
      }
      if (path === "/file") {
        const rel = url.searchParams.get("path") ?? "";
        if (req.method === "GET") return sendJson(res, 200, { path: rel, text: await readText(root, rel) });
        if (req.method === "PUT") {
          await writeText(root, rel, await readBody(req, 1024 * 1024 + 1024));
          return sendJson(res, 200, { ok: true });
        }
        if (req.method === "DELETE") {
          await removePath(root, rel);
          return sendJson(res, 200, { ok: true });
        }
      }
      if (req.method === "POST" && path === "/scaffold") {
        const b = JSON.parse(await readBody(req, 4096)) as Record<string, string>;
        const file = await scaffoldProblem(root, b.module, b.dir, b.pkg, b.title ?? "", b.url ?? "");
        return sendJson(res, 200, { path: file });
      }

      if (req.method === "POST" && path === "/setup") {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        const line = (o: unknown) => res.write(JSON.stringify(o) + "\n");
        await ensureWorkspace(root);
        for (const args of setupCommands(uid, gid)) {
          line({ t: "o", d: `$ docker ${args.join(" ")}\n` });
          const r = await docker(args, { timeoutMs: 15 * 60_000 });
          line({ t: "o", d: r.out.slice(-4000) });
          if (r.code !== 0) {
            line({ t: "x", code: r.code });
            return res.end();
          }
        }
        line({ t: "x", code: 0 });
        return res.end();
      }

      if (req.method === "POST" && path === "/run") {
        const r = parseRunRequest(JSON.parse(await readBody(req, 4096)));
        if (running.size >= MAX_RUNS) return sendJson(res, 429, { error: `at most ${MAX_RUNS} runs at once` });
        const moduleDir = safePath(root, r.module);
        if (!(await listModules(root)).includes(r.module)) return sendJson(res, 404, { error: "no such module" });

        const id = randomBytes(6).toString("hex");
        const name = `gosteps-run-${id}`;
        const args = dockerArgs(r, { moduleDir, uid, gid, name });
        const child = spawnStreaming(args);
        running.set(id, { child, name });

        res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
        const line = (o: unknown) => res.write(JSON.stringify(o) + "\n");
        line({ t: "start", id, cmd: args.slice(args.indexOf(IMAGE) + 1).join(" "), network: r.action === "tidy" });

        const started = Date.now();
        let size = 0;
        let truncated = false;
        let timedOut = false;
        const onData = (d: Buffer) => {
          if (truncated) return;
          size += d.length;
          if (size > MAX_OUTPUT) {
            truncated = true;
            line({ t: "o", d: "\n… output truncated at 2 MB …\n" });
            return;
          }
          line({ t: "o", d: d.toString("utf8") });
        };
        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);
        const timer = setTimeout(() => {
          timedOut = true;
          void docker(["kill", name], { timeoutMs: 10_000 });
        }, TIMEOUT_MS[r.action]);
        // If the browser goes away (tab closed, Stop), kill the container too.
        res.on("close", () => {
          if (running.has(id)) void docker(["kill", name], { timeoutMs: 10_000 });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          running.delete(id);
          line({ t: "x", code: code ?? -1, ms: Date.now() - started, timedOut, truncated });
          res.end();
        });
        child.on("error", (e) => {
          clearTimeout(timer);
          running.delete(id);
          line({ t: "o", d: `failed to start docker: ${e.message}\n` });
          line({ t: "x", code: -1, ms: 0, timedOut: false, truncated: false });
          res.end();
        });
        return;
      }

      if (req.method === "POST" && path === "/stop") {
        const { id } = JSON.parse(await readBody(req, 1024)) as { id?: string };
        const r = id ? running.get(id) : undefined;
        if (r) await docker(["kill", r.name], { timeoutMs: 10_000 });
        return sendJson(res, 200, { ok: Boolean(r) });
      }

      return sendJson(res, 404, { error: "not found" });
    } catch (e) {
      const status = e instanceof PathError || e instanceof RunError || e instanceof SyntaxError ? 400 : (e as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
      if (!res.headersSent) return sendJson(res, status, { error: e instanceof Error ? e.message : "error" });
      res.end();
    }
  });

  server.on("close", () => {
    for (const { name } of running.values()) void docker(["kill", name], { timeoutMs: 10_000 });
  });
  return server;
}

/** Remove sandboxes left behind by a crash. */
async function cleanupOrphans() {
  const ps = await docker(["ps", "-aq", "--filter", `label=${LABEL}`], { timeoutMs: 10_000 });
  const ids = ps.out.split("\n").map((s) => s.trim()).filter(Boolean);
  if (ps.code === 0 && ids.length) await docker(["rm", "-f", ...ids], { timeoutMs: 20_000 });
}

if (process.argv[1] && import.meta.filename === process.argv[1] && process.argv.includes("--setup")) {
  // `pnpm ide:setup`: pull the image, create caches and the workspace, then exit.
  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;
  await ensureWorkspace(workspaceRoot());
  for (const args of setupCommands(uid, gid)) {
    console.log(`$ docker ${args.join(" ")}`);
    const r = await docker(args, { timeoutMs: 15 * 60_000 });
    if (r.code !== 0) {
      console.error(r.out);
      process.exit(1);
    }
  }
  console.log(`✓ Sandbox ready. Workspace: ${workspaceRoot()}`);
  process.exit(0);
}

if (process.argv[1] && import.meta.filename === process.argv[1] && !process.argv.includes("--setup")) {
  const port = Number(process.env.GOSTEPS_IDE_PORT ?? DEFAULT_PORT);
  const server = createIdeServer();
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.log(`GoSteps IDE runner: port ${port} is already in use, so another runner is probably running. Using that one.`);
      process.exit(0);
    }
    throw e;
  });
  void cleanupOrphans();
  server.listen(port, "127.0.0.1", async () => {
    const st = await dockerStatus();
    console.log(`GoSteps IDE runner: workspace ${workspaceRoot()} (http://127.0.0.1:${port})`);
    if (!st.available) console.log("GoSteps IDE runner: Docker isn't running. Start Docker Desktop to run code; editing still works.");
    else if (!st.imageReady) console.log(`GoSteps IDE runner: image ${IMAGE} not pulled yet. Open the IDE and click "Set up sandbox", or run: pnpm ide:setup`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

export { IDE_HEADER };
