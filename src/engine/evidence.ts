import type { Criterion } from "./course";

// Parses `go test` output (plain text or -json) into facts the pass criteria can check.

export interface PackageResult {
  name: string;
  ok: boolean;
  coverage: number | null;
}

export interface Benchmark {
  name: string;
  nsPerOp: number;
  bytesPerOp: number | null;
  allocsPerOp: number | null;
}

export interface TestReport {
  packages: PackageResult[];
  failedTests: string[];
  races: number;
  leaks: boolean;
  panicked: boolean;
  coverage: number | null;
  benchmarks: Benchmark[];
  /** True when the output contains no failure markers and at least one passing package or PASS line. */
  passed: boolean;
}

const OK_LINE = /^ok\s+(\S+)\s+(?:[\d.]+s|\(cached\))(?:\s+coverage:\s+([\d.]+)% of statements)?/;
const FAIL_LINE = /^FAIL\s+(\S+)\s+[\d.]+s/;
const COVER_ONLY = /^(?:ok\s+)?(\S+)?\s*coverage:\s+([\d.]+)% of statements/;
const BENCH_LINE = /^(Benchmark\S+)\s+\d+\s+([\d.]+) ns\/op(?:\s+([\d.]+) B\/op)?(?:\s+([\d.]+) allocs\/op)?/;

function textLines(input: string): string[] {
  const lines = input.split(/\r?\n/);
  const jsonish = lines.filter((l) => l.trim().startsWith("{\"")).length;
  if (jsonish < lines.length / 2) return lines;
  // go test -json: rebuild the plain output from Output events.
  const out: string[] = [];
  for (const l of lines) {
    try {
      const ev = JSON.parse(l) as { Action?: string; Output?: string };
      if (ev.Action === "output" && ev.Output) out.push(...ev.Output.replace(/\n$/, "").split("\n"));
    } catch {
      out.push(l);
    }
  }
  return out;
}

export function parseGoTest(input: string): TestReport {
  const packages = new Map<string, PackageResult>();
  const failedTests: string[] = [];
  const benchmarks: Benchmark[] = [];
  let races = 0;
  let leaks = false;
  let panicked = false;
  let sawPass = false;
  let failMarker = false;

  for (const raw of textLines(input)) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = line.match(OK_LINE))) {
      packages.set(m[1], { name: m[1], ok: true, coverage: m[2] ? Number(m[2]) : null });
    } else if ((m = line.match(FAIL_LINE))) {
      packages.set(m[1], { name: m[1], ok: false, coverage: null });
      failMarker = true;
    } else if ((m = line.match(COVER_ONLY)) && m[1] && !packages.has(m[1])) {
      packages.set(m[1], { name: m[1], ok: true, coverage: Number(m[2]) });
    }
    if ((m = line.match(/^--- FAIL: (\S+)/))) failedTests.push(m[1]);
    if (line === "FAIL") failMarker = true;
    if (line === "PASS") sawPass = true;
    if (line.includes("WARNING: DATA RACE")) races++;
    if (line.includes("found unexpected goroutines")) leaks = true;
    if (/^panic: /.test(line)) panicked = true;
    if ((m = line.match(BENCH_LINE))) {
      benchmarks.push({
        name: m[1],
        nsPerOp: Number(m[2]),
        bytesPerOp: m[3] ? Number(m[3]) : null,
        allocsPerOp: m[4] ? Number(m[4]) : null,
      });
    }
  }

  const pkgs = [...packages.values()];
  const covered = pkgs.filter((p) => p.coverage !== null);
  const coverage = covered.length
    ? Math.round((covered.reduce((a, p) => a + (p.coverage ?? 0), 0) / covered.length) * 10) / 10
    : null;
  const anyPass = sawPass || pkgs.some((p) => p.ok);
  const passed = anyPass && !failMarker && failedTests.length === 0 && races === 0 && !panicked && !leaks;
  return { packages: pkgs, failedTests, races, leaks, panicked, coverage, benchmarks, passed };
}

export interface CriterionResult {
  criterion: Criterion;
  ok: boolean;
  message: string;
}

export interface EvidenceFlags {
  /** The learner confirms the output came from a `-race` run (go test output doesn't say). */
  raceConfirmed: boolean;
  /** The learner confirms goleak.VerifyTestMain/VerifyNone is wired into the tested packages. */
  goleakConfirmed: boolean;
  commitUrl: string;
}

export const COMMIT_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(commit\/[0-9a-f]{7,40}|releases\/tag\/\S+|pull\/\d+)\/?$/;

export function checkCriteria(criteria: Criterion[], r: TestReport, f: EvidenceFlags): CriterionResult[] {
  return criteria.map((c): CriterionResult => {
    switch (c.kind) {
      case "go-test":
        return { criterion: c, ok: r.passed, message: r.passed ? "Tests pass" : summarizeFailure(r) };
      case "go-test-race":
        if (!r.passed) return { criterion: c, ok: false, message: summarizeFailure(r) };
        return f.raceConfirmed
          ? { criterion: c, ok: true, message: "Tests pass with -race, no data races" }
          : { criterion: c, ok: false, message: "Confirm the output is from a -race run" };
      case "goleak":
        if (r.leaks) return { criterion: c, ok: false, message: "goleak found unexpected goroutines" };
        return f.goleakConfirmed
          ? { criterion: c, ok: r.passed, message: r.passed ? "No leaked goroutines" : summarizeFailure(r) }
          : { criterion: c, ok: false, message: "Confirm goleak is wired into these tests" };
      case "coverage": {
        const min = c.min ?? 0;
        if (r.coverage === null) return { criterion: c, ok: false, message: "No coverage figure found. Run with -cover" };
        return { criterion: c, ok: r.coverage >= min, message: `Coverage ${r.coverage}% (need ${min}%)` };
      }
      case "go-bench":
        return r.benchmarks.length
          ? { criterion: c, ok: true, message: `${r.benchmarks.length} benchmark result(s) found` }
          : { criterion: c, ok: false, message: "No benchmark lines found. Run with -bench" };
      case "github-commit":
        return COMMIT_URL.test(f.commitUrl.trim())
          ? { criterion: c, ok: true, message: "GitHub link recorded" }
          : { criterion: c, ok: false, message: "Add a github.com commit, pull request or release URL" };
    }
  });
}

function summarizeFailure(r: TestReport): string {
  if (r.races) return `${r.races} data race warning(s)`;
  if (r.panicked) return "A test panicked";
  if (r.leaks) return "Leaked goroutines found";
  if (r.failedTests.length) return `Failing: ${r.failedTests.slice(0, 3).join(", ")}`;
  if (!r.packages.length) return "Couldn't find go test results in that text";
  return "Tests did not pass";
}
