// Browser client for the IDE runner (scripts/ide-server.ts). Optional, like the file store:
// when the runner isn't running, `health()` returns null and the UI explains how to start it.

export const DEFAULT_IDE_URL = process.env.NEXT_PUBLIC_GOSTEPS_IDE ?? "http://127.0.0.1:4778";

export function ideUrl(): string {
  try {
    return localStorage.getItem("gosteps.ideUrl") || DEFAULT_IDE_URL;
  } catch {
    return DEFAULT_IDE_URL;
  }
}

const H = { "x-gosteps": "1" };

export interface IdeHealth {
  workspace: string;
  image: string;
  modules: string[];
  docker: { available: boolean; version: string | null; imageReady: boolean };
}

export interface Entry {
  path: string;
  type: "file" | "dir";
  size: number;
}

export type RunAction = "run" | "test" | "vet" | "fmt" | "build" | "tidy";

export interface RunRequest {
  module: string;
  action: RunAction;
  pkg?: string;
  race?: boolean;
  cover?: boolean;
  verbose?: boolean;
  json?: boolean;
  run?: string;
  bench?: string;
  count?: number;
}

export interface RunResult {
  code: number;
  ms: number;
  timedOut: boolean;
  truncated: boolean;
  output: string;
}

async function req(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${ideUrl()}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) }, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function json<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${r.status})`);
  return body as T;
}

export async function health(): Promise<IdeHealth | null> {
  try {
    return await json<IdeHealth>(await req("/health", {}, 6000));
  } catch {
    return null;
  }
}

export const listTree = async (module: string) => (await json<{ entries: Entry[] }>(await req(`/tree?module=${encodeURIComponent(module)}`))).entries;
export const readFile = async (path: string) => (await json<{ text: string }>(await req(`/file?path=${encodeURIComponent(path)}`))).text;
export const writeFile = async (path: string, text: string) => {
  await json(await req(`/file?path=${encodeURIComponent(path)}`, { method: "PUT", body: text }));
};
export const deleteFile = async (path: string) => {
  await json(await req(`/file?path=${encodeURIComponent(path)}`, { method: "DELETE" }));
};
export const scaffold = async (b: { module: string; dir: string; pkg: string; title: string; url: string }) =>
  (await json<{ path: string }>(await req("/scaffold", { method: "POST", body: JSON.stringify(b) }))).path;
export const stopRun = async (id: string) => {
  await req("/stop", { method: "POST", body: JSON.stringify({ id }) });
};

/** Read an NDJSON stream of {t:"start"|"o"|"x"} lines. */
async function stream(r: Response, onLine: (l: Record<string, unknown>) => void) {
  if (!r.ok || !r.body) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${r.status})`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.trim()) onLine(JSON.parse(line));
    }
  }
}

export async function runInSandbox(
  body: RunRequest,
  on: { output?: (chunk: string) => void; start?: (id: string, cmd: string, network: boolean) => void } = {},
): Promise<RunResult> {
  const r = await req("/run", { method: "POST", body: JSON.stringify(body) }, 15 * 60_000);
  let output = "";
  let result: RunResult = { code: -1, ms: 0, timedOut: false, truncated: false, output: "" };
  await stream(r, (l) => {
    if (l.t === "start") on.start?.(String(l.id), String(l.cmd), Boolean(l.network));
    else if (l.t === "o") {
      output += String(l.d);
      on.output?.(String(l.d));
    } else if (l.t === "x") result = { code: Number(l.code), ms: Number(l.ms ?? 0), timedOut: Boolean(l.timedOut), truncated: Boolean(l.truncated), output };
  });
  return { ...result, output };
}

export async function setupSandbox(onOutput: (chunk: string) => void): Promise<number> {
  const r = await req("/setup", { method: "POST" }, 20 * 60_000);
  let code = -1;
  await stream(r, (l) => {
    if (l.t === "o") onOutput(String(l.d));
    else if (l.t === "x") code = Number(l.code);
  });
  return code;
}
