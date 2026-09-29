import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { completeTask, isMet, openPenalty, reviewCard, rollover, today, spendRestToken, writeReflection, startStasis } from "../game";
import { act, at, fresh, idx } from "./helpers";
import type { GameState } from "../state";


const DAY1 = at("2026-10-01T10:00:00");
const dayAfter = (n: number) => new Date(DAY1.getTime() + n * 86_400_000);

describe("onboarding and daily orders", () => {
  it("issues concept, build, review-free and reflection orders on day one", () => {
    const s = fresh(DAY1);
    const o = Object.values(s.orders)[0];
    expect(o.items.map((i) => i.kind)).toEqual(["concept", "build", "reflect"]);
    expect(o.items[0].taskId).toBe("q01-toolchain.understand.1");
    expect(o.items[1].taskId).toBe("q01-toolchain.smallest.1");
  });

  it("project-first puts the build order first and makes reading optional", () => {
    const s = fresh(DAY1, { methods: ["project"] });
    const o = Object.values(s.orders)[0];
    expect(o.items.map((i) => [i.kind, i.optional])).toEqual([["build", false], ["concept", true]]);
  });
});

describe("completing tasks", () => {
  it("awards XP, stats, marks orders, and creates cards after the Understand stage", () => {
    let s = fresh(DAY1);
    s = act(s, DAY1, (d, c) => completeTask(d, c, "q01-toolchain.understand.1", { verify: "honor" }));
    expect(s.player.xp).toBe(10);
    expect(Object.keys(s.cards)).toHaveLength(0);
    s = act(s, DAY1, (d, c) => completeTask(d, c, "q01-toolchain.understand.2", { verify: "honor" }));
    expect(Object.keys(s.cards)).toHaveLength(3);
    expect(s.player.statXP.FND).toBeGreaterThan(0);
    expect(s.orders["2026-10-01"].items[0].done).toBe(true);
  });

  it("grants the 20% completion bonus once all orders are done", () => {
    let s = fresh(DAY1);
    s = act(s, DAY1, (d, c) => {
      completeTask(d, c, "q01-toolchain.understand.1", { verify: "honor" });
      completeTask(d, c, "q01-toolchain.smallest.1", { verify: "honor", sessions: 1 });
      writeReflection(d, c, ["built", "surprised", "next"]);
    });
    const o = s.orders["2026-10-01"];
    expect(o.bonusGranted).toBe(true);
    const sum = o.items.reduce((a, i) => a + i.xp, 0);
    expect(Object.values(s.log).find((l) => l.kind === "bonus")?.delta).toBe(Math.round(sum * 0.2));
    expect(isMet(o)).toBe(true);
  });

  it("caps read XP at 3 per day", () => {
    let s = fresh(DAY1);
    const reads = idx.orderedTasks.filter((t) => t.type === "read").slice(0, 4);
    s = act(s, DAY1, (d, c) => reads.forEach((t) => completeTask(d, c, t.id, { verify: "honor" })));
    expect(s.progress[reads[3].id].xp).toBe(0);
    expect(s.player.xp).toBe(30);
  });
});

describe("penalty, escrow and decay (DESIGN §3.5 worked example)", () => {
  function levelFifteen(): GameState {
    let s = fresh(DAY1, { autoUseTokens: false });
    s = act(s, DAY1, (d) => {
      d.player.xp = 3700; // level 15
      d.player.rank = "C";
      d.player.bossPhases = [1, 3];
    });
    return s;
  }

  it("grace day, then penalty + decay 13, 26, 38, escrow, then release", () => {
    let s = levelFifteen();
    // Day 1 (Oct 1) is missed: evaluated on Oct 2 → inside grace.
    s = act(s, dayAfter(1), rollover);
    expect(s.player.xp).toBe(3700);
    expect(openPenalty(s)).toBeUndefined();

    // Day 2 missed → penalty issued, decay 3% of 425 = 13.
    s = act(s, dayAfter(2), rollover);
    expect(openPenalty(s)).toBeDefined();
    expect(s.player.xp).toBe(3687);

    // Day 3 missed → 26.
    s = act(s, dayAfter(3), rollover);
    expect(s.player.xp).toBe(3661);

    // Day 4: earn XP while the penalty is open → escrow; the day is still unmet → decay 38.
    const t = openPenalty(s)!.taskId!;
    // Pick work that isn't one of today's orders, so the day stays unmet.
    const other = idx.orderedTasks.find((x) => x.type === "implement" && x.questId !== "q01-toolchain" && x.id !== t)!;
    s = act(s, dayAfter(3), (d, c) => completeTask(d, c, other.id, { verify: "honor", sessions: 1 }));
    expect(s.player.escrowXP).toBeGreaterThan(0);
    expect(s.player.xp).toBe(3661);
    s = act(s, dayAfter(4), rollover);
    expect(s.player.xp).toBe(3623);

    // Day 5: clear the penalty → escrow released, not repaired (past 48 h).
    const held = s.player.escrowXP;
    const late = new Date(dayAfter(4).getTime() + 3600_000); // 49 h after the penalty was issued
    s = act(s, late, (d, c) => completeTask(d, c, openPenalty(d)!.taskId!, { verify: "honor", sessions: 1 }));
    expect(openPenalty(s)).toBeUndefined();
    expect(s.player.escrowXP).toBe(0);
    expect(s.player.xp).toBeGreaterThanOrEqual(3623 + held);
    expect(Object.values(s.penalties)[0].repaired).toBe(false);
  });

  it("gentle mode never decays", () => {
    let s = fresh(DAY1, { severity: "gentle", autoUseTokens: false });
    s = act(s, DAY1, (d) => { d.player.xp = 3700; });
    s = act(s, dayAfter(6), rollover);
    expect(s.player.xp).toBe(3700);
    expect(openPenalty(s)).toBeDefined();
  });

  it("never decays below the rank floor, and demotes after 10 days there", () => {
    let s = levelFifteen();
    s = act(s, dayAfter(60), rollover);
    expect(s.player.rank).toBe("D");
    expect(s.player.rankLock).toBe("C");
  });

  it("rest tokens cover a missed day automatically", () => {
    let s = fresh(DAY1, { autoUseTokens: true });
    const tokens = s.player.restTokens;
    s = act(s, dayAfter(1), rollover);
    expect(s.player.restTokens).toBe(tokens - 1);
    expect(s.orders["2026-10-01"].tokenUsed).toBe(true);
    expect(s.player.missedStreak).toBe(0);
  });

  it("a manually used token covers today", () => {
    let s = fresh(DAY1, { autoUseTokens: false });
    s = act(s, DAY1, (d, c) => { spendRestToken(d, c); });
    s = act(s, dayAfter(1), rollover);
    expect(s.player.missedStreak).toBe(0);
  });

  it("stasis freezes evaluation", () => {
    let s = fresh(DAY1, { autoUseTokens: false });
    s = act(s, DAY1, (d, c) => { startStasis(d, c, 5); });
    s = act(s, dayAfter(3), rollover);
    expect(s.player.missedStreak).toBe(0);
    expect(openPenalty(s)).toBeUndefined();
  });
});

describe("reviews", () => {
  it("schedules cards with FSRS and advances the review order", () => {
    let s = fresh(DAY1);
    s = act(s, DAY1, (d, c) => {
      completeTask(d, c, "q01-toolchain.understand.1", { verify: "honor" });
      completeTask(d, c, "q01-toolchain.understand.2", { verify: "honor" });
    });
    s = act(s, dayAfter(1), rollover);
    const o = s.orders["2026-10-02"];
    const review = o.items.find((i) => i.kind === "review")!;
    expect(review.target).toBe(3);
    const cardId = Object.keys(s.cards)[0];
    s = act(s, dayAfter(1), (d, c) => reviewCard(d, c, cardId, Rating.Good));
    expect(new Date(s.cards[cardId].fsrs.due) > dayAfter(1)).toBe(true);
    expect(s.orders["2026-10-02"].items.find((i) => i.kind === "review")!.progress).toBe(1);
    expect(s.player.totalReviews).toBe(1);
  });

  it("uses a 04:00 day boundary", () => {
    const now = at("2026-10-02T02:30:00");
    const s = fresh(now);
    expect(Object.keys(s.orders)).toEqual(["2026-10-01"]);
    act(s, now, (d, c) => expect(today(d, c)).toBe("2026-10-01"));
  });
});
