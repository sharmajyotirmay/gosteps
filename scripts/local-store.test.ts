import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createStoreServer } from "./local-store";
import { initialState } from "../src/engine/state";
import { makeBundle } from "../src/storage/adapter";

const dir = mkdtempSync(join(tmpdir(), "gosteps-store-"));
const server = createStoreServer(dir);
let base = "";

beforeAll(async () => {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("local store server", () => {
  it("reports health and 404s before the first save", async () => {
    const h = await (await fetch(`${base}/health`)).json();
    expect(h).toMatchObject({ ok: true, dir, savedAt: null });
    expect((await fetch(`${base}/state`)).status).toBe(404);
  });

  it("rejects bodies that aren't GoSteps bundles", async () => {
    const r = await fetch(`${base}/state`, { method: "PUT", body: JSON.stringify({ hello: 1 }) });
    expect(r.status).toBe(400);
  });

  it("saves atomically, keeps a daily backup, and serves it back", async () => {
    const s = initialState("go", new Date());
    s.player.name = "Disk";
    const r = await fetch(`${base}/state`, { method: "PUT", body: JSON.stringify(makeBundle(s, new Date())) });
    expect(r.status).toBe(200);
    expect(existsSync(join(dir, "state.json"))).toBe(true);
    expect(existsSync(join(dir, "state.json.tmp"))).toBe(false);
    expect(readdirSync(join(dir, "backups"))).toHaveLength(1);
    const back = await (await fetch(`${base}/state`)).json();
    expect(back.state.player.name).toBe("Disk");
  });

  it("only answers pages served from localhost", async () => {
    const evil = await fetch(`${base}/state`, { headers: { Origin: "https://example.com" } });
    expect(evil.status).toBe(403);
    const ok = await fetch(`${base}/health`, { headers: { Origin: "http://localhost:3000" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("works end to end through the browser client", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOSTEPS_STORE", base);
    vi.resetModules();
    const disk = await import("../src/storage/disk");
    expect((await disk.probeDisk())?.file).toBe(join(dir, "state.json"));
    const s = initialState("go", new Date());
    s.player.name = "Client";
    await disk.saveToDisk(s);
    expect((await disk.loadFromDisk())?.state.player.name).toBe("Client");
    vi.unstubAllEnvs();
  });
});
