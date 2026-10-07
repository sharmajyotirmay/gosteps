import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { request } from "node:http";
import { createIdeServer } from "../ide-server";
import { dockerStatus } from "./sandbox";

const root = mkdtempSync(join(tmpdir(), "gosteps-ide-"));
const server = createIdeServer({ root });
let base = "";
const H = { "x-gosteps": "1" };

beforeAll(async () => {
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

async function run(body: object) {
  const r = await fetch(`${base}/run`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const lines = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
  return { out: lines.filter((l) => l.t === "o").map((l) => l.d).join(""), exit: lines.at(-1) };
}

describe("IDE server: access rules", () => {
  it("serves health without the header", async () => {
    const h = await (await fetch(`${base}/health`)).json();
    expect(h.modules).toEqual(["dsa-go", "jobq"]);
  });
  it("requires the x-gosteps header for everything else", async () => {
    expect((await fetch(`${base}/tree?module=jobq`)).status).toBe(403);
    expect((await fetch(`${base}/tree?module=jobq`, { headers: H })).status).toBe(200);
  });
  it("rejects other websites and DNS rebinding", async () => {
    expect((await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } })).status).toBe(403);
    // fetch() can't override Host, so send a raw request the way a rebinding page would arrive.
    const status = await new Promise<number>((ok) => {
      request(`${base}/health`, { headers: { Host: "evil.example:80" } }, (r) => { r.resume(); ok(r.statusCode ?? 0); }).end();
    });
    expect(status).toBe(403);
  });
  it("rejects path escapes over HTTP", async () => {
    const r = await fetch(`${base}/file?path=${encodeURIComponent("../../etc/passwd")}`, { headers: H });
    expect(r.status).toBe(400);
  });
});

// Real sandbox runs: only when Docker is up and the Go image is pulled (`pnpm ide:setup`).
const st = await dockerStatus();
describe.skipIf(!st.available || !st.imageReady)("IDE server: Docker sandbox", () => {
  it("runs go test -race and reports the result", async () => {
    await fetch(`${base}/file?path=jobq/sum/sum.go`, { method: "PUT", headers: H, body: "package sum\n\nfunc Sum(a, b int) int { return a + b }\n" });
    await fetch(`${base}/file?path=jobq/sum/sum_test.go`, {
      method: "PUT", headers: H,
      body: 'package sum\n\nimport "testing"\n\nfunc TestSum(t *testing.T) {\n\tif Sum(2, 3) != 5 {\n\t\tt.Fatal("bad")\n\t}\n}\n',
    });
    const { out, exit } = await run({ module: "jobq", action: "test", race: true, cover: true });
    expect(exit.code).toBe(0);
    expect(out).toMatch(/ok\s+jobq\/sum.*coverage: 100.0% of statements/);
  }, 240_000);

  it("can't reach the network, the host, or anything outside its module", async () => {
    await fetch(`${base}/file?path=jobq/escape/main.go`, {
      method: "PUT", headers: H,
      body: `package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	c := http.Client{Timeout: 2 * time.Second}
	_, err := c.Get("http://host.docker.internal:3000/")
	fmt.Println("network blocked:", err != nil)
	fmt.Println("rootfs readonly:", os.WriteFile("/etc/x", []byte("x"), 0o644) != nil)
	_, err = os.Stat("/src/../dsa-go")
	fmt.Println("other modules hidden:", err != nil)
	fmt.Println("not root:", os.Getuid() != 0)
}
`,
    });
    const { out, exit } = await run({ module: "jobq", action: "run", pkg: "./escape" });
    expect(exit.code).toBe(0);
    expect(out).toContain("network blocked: true");
    expect(out).toContain("rootfs readonly: true");
    expect(out).toContain("other modules hidden: true");
    expect(out).toContain("not root: true");
  }, 240_000);

  it("kills runaway programs at the limit", async () => {
    await fetch(`${base}/file?path=jobq/forkbomb/main.go`, {
      method: "PUT", headers: H,
      body: 'package main\n\nimport "os/exec"\n\nfunc main() {\n\tfor i := 0; i < 1000; i++ {\n\t\t_ = exec.Command("sleep", "60").Start()\n\t}\n\tprintln("spawned")\n}\n',
    });
    const { exit } = await run({ module: "jobq", action: "run", pkg: "./forkbomb" });
    expect(exit.code).toBe(0); // the pids limit makes most Starts fail instead of hanging the machine
  }, 240_000);
});
