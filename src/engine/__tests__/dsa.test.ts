import { describe, expect, it } from "vitest";
import { dsaDay, logProblem, pace, redoQueue, startDsa, studyPattern, submitGate, uniqueSolved } from "../dsa";
import { toSlug } from "../dsa-track";
import { isMet, rollover } from "../game";
import { initialState, normalizeState, type GameState } from "../state";
import { act, at, dsa, fresh } from "./helpers";

const DAY1 = at("2026-10-05T10:00:00");
const later = (days: number, hours = 0) => new Date(DAY1.getTime() + days * 86_400_000 + hours * 3600_000);
const started = () => act(fresh(DAY1), DAY1, (d, c) => startDsa(d, c));
const log = (s: GameState, now: Date, problem: string, extra: Partial<Parameters<typeof logProblem>[2]> = {}) =>
  act(s, now, (d, c) => { logProblem(d, c, { problem, difficulty: "easy", outcome: "solved", inGo: true, ...extra }); });

describe("DSA plan", () => {
  it("has 100 plan days across 35 topics", () => {
    expect(dsa.dayPlan).toHaveLength(100);
    expect(dsa.topics).toHaveLength(35);
    expect(dsa.dayPlan[0]).toBe("t01-hashing");
    expect(dsa.dayPlan[99]).toBe("t35-mixed-2");
  });

  it("parses slugs from URLs and titles", () => {
    expect(toSlug("https://leetcode.com/problems/two-sum/description/")).toBe("two-sum");
    expect(toSlug("1. Two Sum")).toBe("two-sum");
    expect(toSlug("Pow(x, n)")).toBe("pow-x-n");
  });
});

describe("starting the challenge", () => {
  it("adds a DSA order for today with a target of 10", () => {
    const s = started();
    expect(dsaDay(s, "2026-10-05")).toBe(1);
    const item = s.orders["2026-10-05"].items.find((i) => i.kind === "dsa")!;
    expect(item.target).toBe(10);
    expect(item.title).toContain("day 1/100");
    expect(item.title).toContain("Arrays and hash maps");
  });

  it("isn't added until started", () => {
    const s = fresh(DAY1);
    expect(s.orders["2026-10-05"].items.some((i) => i.kind === "dsa")).toBe(false);
  });
});

describe("logging problems", () => {
  it("awards XP with the Go bonus, ALG stat, and advances the order", () => {
    let s = started();
    s = log(s, DAY1, "https://leetcode.com/problems/two-sum/");
    const p = Object.values(s.problems)[0];
    expect(p.title).toBe("Two Sum");
    expect(p.topicId).toBe("t01-hashing");
    expect(p.xp).toBe(10); // 8 × 1.2
    expect(s.player.statXP.ALG).toBe(10);
    expect(s.orders["2026-10-05"].items.find((i) => i.kind === "dsa")!.progress).toBe(1);
  });

  it("counts each problem once toward the goal and today's target", () => {
    let s = started();
    s = log(s, DAY1, "two-sum");
    s = log(s, DAY1, "two-sum");
    expect(uniqueSolved(s).size).toBe(1);
    expect(s.orders["2026-10-05"].items.find((i) => i.kind === "dsa")!.progress).toBe(1);
  });

  it("meets the day and completes the order at 10 problems", () => {
    let s = started();
    for (const p of dsa.topics[0].problems.concat(dsa.topics[1].problems).slice(0, 10)) s = log(s, DAY1, p.slug, { difficulty: p.difficulty });
    const o = s.orders["2026-10-05"];
    expect(o.items.find((i) => i.kind === "dsa")!.done).toBe(true);
    expect(isMet(o)).toBe(true);
    expect(s.achievements["dsa-ten-day"]).toBeDefined();
  });

  it("schedules hint and failed attempts for a redo, and closes them on retry", () => {
    let s = started();
    s = log(s, DAY1, "3sum", { outcome: "hint", difficulty: "medium" });
    s = log(s, DAY1, "trapping-rain-water", { outcome: "failed", difficulty: "hard" });
    expect(uniqueSolved(s).size).toBe(1); // hint counts, failed doesn't
    expect(redoQueue(s, later(1, 1)).map((p) => p.slug)).toEqual(["trapping-rain-water"]);
    expect(redoQueue(s, later(3, 1)).map((p) => p.slug).sort()).toEqual(["3sum", "trapping-rain-water"]);
    s = log(s, later(3, 1), "trapping-rain-water", { difficulty: "hard" });
    expect(redoQueue(s, later(3, 2)).map((p) => p.slug)).toEqual(["3sum"]);
  });
});

describe("pace", () => {
  it("raises the daily target when behind and reports the deficit", () => {
    let s = started();
    s = act(s, later(2), rollover); // two days with nothing solved
    const p = act(s, later(2), (d, c) => { expect(pace(d, c)).toMatchObject({ day: 3, solved: 0, expected: 30, delta: -30, target: 11 }); });
    expect(p).toBeTruthy();
    const item = s.orders["2026-10-07"].items.find((i) => i.kind === "dsa")!;
    expect(item.target).toBe(11);
  });

  it("caps the target at 20 so catching up never means cramming 40 a day", () => {
    let s = started();
    s = act(s, later(60), rollover);
    act(s, later(60), (d, c) => expect(pace(d, c)!.target).toBe(20));
  });
});

describe("patterns and gates", () => {
  it("studying a pattern adds ALG cards to the shared deck", () => {
    let s = started();
    s = act(s, DAY1, (d, c) => studyPattern(d, c, "t01-hashing"));
    const cards = Object.values(s.cards);
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.statId === "ALG")).toBe(true);
  });

  it("timed gate passes at 3/4 within the limit", () => {
    let s = started();
    s = act(s, DAY1, (d, c) => { submitGate(d, c, "dp1", 2, 50); });
    expect(s.progress["dsa:dboss-p1"]).toBeUndefined();
    s = act(s, DAY1, (d, c) => { submitGate(d, c, "dp1", 3, 58); });
    expect(s.progress["dsa:dboss-p1"]).toBeDefined();
    expect(s.achievements["dsa-gate"]).toBeDefined();
  });
});

describe("normalizeState", () => {
  it("upgrades a save written before the DSA track existed", () => {
    const old = initialState("go", DAY1) as unknown as Record<string, unknown>;
    const settings = { ...(old.settings as object) } as Record<string, unknown>;
    delete settings.dsa;
    delete old.problems;
    const s = normalizeState({ ...old, settings } as unknown as GameState);
    expect(s.settings.dsa).toMatchObject({ enabled: true, start: null, goal: 1000, days: 100 });
    expect(s.problems).toEqual({});
  });
});
