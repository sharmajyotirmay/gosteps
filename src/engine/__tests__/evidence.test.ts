import { describe, expect, it } from "vitest";
import { checkCriteria, parseGoTest } from "../evidence";

const PASS = `?   	github.com/me/jobq/cmd/jobq	[no test files]
ok  	github.com/me/jobq/internal/job	0.012s	coverage: 82.4% of statements
ok  	github.com/me/jobq/internal/store	1.201s	coverage: 71.0% of statements`;

const RACE = `==================
WARNING: DATA RACE
Write at 0x00c000124018 by goroutine 8:
  jobq/internal/store.(*MemoryStore).Add()
==================
--- FAIL: TestHammer (0.02s)
    testing.go:1490: race detected during execution of test
FAIL
FAIL	github.com/me/jobq/internal/store	0.412s
FAIL`;

const flags = { raceConfirmed: true, goleakConfirmed: true, commitUrl: "" };

describe("parseGoTest", () => {
  it("reads passing packages and averages coverage", () => {
    const r = parseGoTest(PASS);
    expect(r.passed).toBe(true);
    expect(r.packages).toHaveLength(2);
    expect(r.coverage).toBe(76.7);
  });

  it("detects races and failures", () => {
    const r = parseGoTest(RACE);
    expect(r.passed).toBe(false);
    expect(r.races).toBe(1);
    expect(r.failedTests).toEqual(["TestHammer"]);
  });

  it("understands go test -json", () => {
    const json = [
      { Action: "run", Test: "TestA" },
      { Action: "output", Output: "=== RUN   TestA\n" },
      { Action: "output", Output: "--- PASS: TestA (0.00s)\n" },
      { Action: "output", Output: "PASS\n" },
      { Action: "output", Output: "ok  \tgithub.com/me/jobq/internal/job\t0.010s\tcoverage: 90.0% of statements\n" },
    ].map((x) => JSON.stringify(x)).join("\n");
    const r = parseGoTest(json);
    expect(r.passed).toBe(true);
    expect(r.coverage).toBe(90);
  });

  it("parses benchmarks", () => {
    const r = parseGoTest(`goos: darwin
BenchmarkEncode-10    	 1834521	       652.3 ns/op	     384 B/op	       3 allocs/op
PASS
ok  	github.com/me/jobq/internal/job	2.1s`);
    expect(r.benchmarks[0]).toEqual({ name: "BenchmarkEncode-10", nsPerOp: 652.3, bytesPerOp: 384, allocsPerOp: 3 });
  });

  it("flags goleak output", () => {
    expect(parseGoTest("goleak: Errors on successful test run: found unexpected goroutines:\nFAIL").leaks).toBe(true);
  });
});

describe("checkCriteria", () => {
  it("checks coverage thresholds and race confirmation", () => {
    const r = parseGoTest(PASS);
    const res = checkCriteria([{ kind: "go-test-race" }, { kind: "coverage", min: 80 }], r, { ...flags, raceConfirmed: false });
    expect(res.map((x) => x.ok)).toEqual([false, false]);
    const ok = checkCriteria([{ kind: "go-test-race" }, { kind: "coverage", min: 70 }], r, flags);
    expect(ok.every((x) => x.ok)).toBe(true);
  });

  it("validates GitHub links", () => {
    const r = parseGoTest(PASS);
    expect(checkCriteria([{ kind: "github-commit" }], r, { ...flags, commitUrl: "https://github.com/me/jobq/commit/abc1234" })[0].ok).toBe(true);
    expect(checkCriteria([{ kind: "github-commit" }], r, { ...flags, commitUrl: "https://example.com" })[0].ok).toBe(false);
  });
});
