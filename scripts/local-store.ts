import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { guardLocal } from "./ide/local-http";

// Local file store: mirrors the app's state to a JSON file on this computer.
// Binds to 127.0.0.1 only and accepts requests only from localhost pages.
//
//   GET  /health  → { ok, dir, file, savedAt }
//   GET  /state   → the last saved backup bundle (404 if none yet)
//   PUT  /state   → save a backup bundle (also keeps one copy per day in backups/)
//
// Data lives in .gosteps-data/ at the repo root (git-ignored), or GOSTEPS_DATA_DIR.

export const DEFAULT_PORT = 4777;
const MAX_BODY = 50 * 1024 * 1024;
const KEEP_BACKUPS = 30;

export function dataDir() {
  return resolve(process.env.GOSTEPS_DATA_DIR ?? join(import.meta.dirname, "..", ".gosteps-data"));
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

async function pruneBackups(dir: string) {
  const files = (await readdir(dir)).filter((f) => /^state-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) await rm(join(dir, f));
}

export function createStoreServer(dir = dataDir()): Server {
  const file = join(dir, "state.json");
  const backups = join(dir, "backups");
  let writing: Promise<unknown> = Promise.resolve();

  return createServer(async (req, res) => {
    if (guardLocal(req, res, { methods: "GET, PUT, OPTIONS" })) return;

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        const s = await stat(file).catch(() => null);
        return send(res, 200, { ok: true, dir, file, savedAt: s ? s.mtime.toISOString() : null });
      }
      if (req.method === "GET" && url.pathname === "/state") {
        const text = await readFile(file, "utf8").catch(() => null);
        return text ? send(res, 200, text) : send(res, 404, { error: "no saved state yet" });
      }
      if (req.method === "PUT" && url.pathname === "/state") {
        const text = await readBody(req);
        const bundle = JSON.parse(text) as { app?: string; schema?: number; state?: unknown };
        if (bundle.app !== "gosteps" || bundle.schema !== 1 || !bundle.state) return send(res, 400, { error: "not a GoSteps bundle" });
        // Serialize writes; write to a temp file then rename, so a crash never leaves half a file.
        writing = writing.then(async () => {
          await mkdir(backups, { recursive: true });
          const tmp = `${file}.tmp`;
          await writeFile(tmp, text);
          await rename(tmp, file);
          const daily = join(backups, `state-${new Date().toISOString().slice(0, 10)}.json`);
          await copyFile(file, daily);
          await pruneBackups(backups);
        });
        await writing;
        return send(res, 200, { ok: true, savedAt: new Date().toISOString() });
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : "bad request" });
    }
  });
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const port = Number(process.env.GOSTEPS_STORE_PORT ?? DEFAULT_PORT);
  const dir = dataDir();
  const server = createStoreServer(dir);
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.log(`GoSteps local store: port ${port} is already in use, so another store is probably running. Using that one.`);
      process.exit(0);
    }
    throw e;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`GoSteps local store: saving to ${join(dir, "state.json")} (http://127.0.0.1:${port})`);
  });
}
