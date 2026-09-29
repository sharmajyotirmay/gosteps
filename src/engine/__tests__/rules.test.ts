import { describe, expect, it } from "vitest";
import { cumulativeXP, decayAmount, levelFromXP, pomodoroMult, qualifyingRank, SEVERITIES, taskXP, xpToNext } from "../rules";

describe("level curve (DESIGN §3.2)", () => {
  it.each([
    [1, 75, 0],
    [5, 175, 450],
    [10, 300, 1575],
    [20, 550, 5700],
    [30, 800, 12325],
    [40, 1050, 21450],
  ])("level %i: %i to next, %i cumulative", (level, next, cum) => {
    expect(xpToNext(level)).toBe(next);
    expect(cumulativeXP(level)).toBe(cum);
    expect(levelFromXP(cum)).toBe(level);
    expect(levelFromXP(cum - 1)).toBe(Math.max(1, level - 1));
  });
});

describe("task XP (DESIGN §3.1)", () => {
  it("matches the worked example: phase 3 implement, evidence, 2/2 sessions → 54", () => {
    expect(taskXP({ type: "implement", phaseIndex: 3, verify: "evidence", methodMult: pomodoroMult(2, 2) })).toBe(54);
  });
  it("never pays less than half for pomodoro tasks", () => {
    expect(pomodoroMult(0, 2)).toBe(0.5);
    expect(pomodoroMult(3, 2)).toBeCloseTo(1.15);
  });
});

describe("ranks", () => {
  it("needs both level and boss", () => {
    expect(qualifyingRank(10, [], false)).toBe("E");
    expect(qualifyingRank(10, [1], false)).toBe("D");
    expect(qualifyingRank(14, [1, 3], false)).toBe("C");
    expect(qualifyingRank(40, [1, 3, 5, 7, 9], false)).toBe("S");
    expect(qualifyingRank(40, [1, 3, 5, 7, 9], true)).toBe("Ω");
  });
});

describe("decay", () => {
  it("is zero on gentle and capped on standard", () => {
    expect(decayAmount(SEVERITIES.gentle, 5, 15)).toBe(0);
    expect(decayAmount(SEVERITIES.standard, 1, 15)).toBe(13);
    expect(decayAmount(SEVERITIES.standard, 2, 15)).toBe(26);
    expect(decayAmount(SEVERITIES.standard, 3, 15)).toBe(38);
    expect(decayAmount(SEVERITIES.standard, 9, 15)).toBe(43); // 10% cap
  });
});
