import type { IncomingMessage, ServerResponse } from "node:http";

// Shared request guard for the local helper servers (file store, IDE runner).
// They bind to 127.0.0.1, and in addition:
//  - Host must be localhost/127.0.0.1 (blocks DNS-rebinding attacks from other websites),
//  - a browser Origin, if present, must be a localhost page (blocks other websites),
//  - optionally a custom header is required, which forces a CORS preflight for browsers.

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const IDE_HEADER = "x-gosteps";

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

/** Returns true when the request was answered (rejected or preflight) and the caller should stop. */
export function guardLocal(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { methods: string; requireHeader?: boolean; exempt?: (path: string) => boolean },
): boolean {
  const host = req.headers.host ?? "";
  if (!LOCAL_HOST.test(host)) {
    sendJson(res, 403, { error: "bad host" });
    return true;
  }
  const origin = req.headers.origin;
  if (origin) {
    if (!LOCAL_ORIGIN.test(origin)) {
      sendJson(res, 403, { error: "only localhost pages may use this service" });
      return true;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", opts.methods);
    res.setHeader("Access-Control-Allow-Headers", `Content-Type, ${IDE_HEADER}`);
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return true;
  }
  const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  if (opts.requireHeader && !opts.exempt?.(path) && req.headers[IDE_HEADER] !== "1") {
    sendJson(res, 403, { error: `missing ${IDE_HEADER} header` });
    return true;
  }
  return false;
}

export function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        fail(new Error("request body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}
