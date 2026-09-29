import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { buildCourse } from "./build-course";
import { STAGES } from "../src/engine/course";

const course = buildCourse(join(__dirname, "../curriculum/go"));

describe("go course", () => {
  it("has 9 phases and 35 quests, each phase with a boss", () => {
    expect(course.phases).toHaveLength(9);
    expect(course.phases.flatMap((p) => p.quests)).toHaveLength(35);
    for (const p of course.phases) expect(p.boss.evidence.length).toBeGreaterThan(0);
  });

  it("gives every quest the Learning Rule loop in order", () => {
    for (const q of course.phases.flatMap((p) => p.quests)) {
      const stages = q.tasks.map((t) => STAGES.indexOf(t.stage));
      expect(stages).toEqual([...stages].sort((a, b) => a - b));
      expect(q.tasks[0].stage).toBe("understand");
      expect(q.tasks.at(-1)!.stage).toBe("next");
      if (q.concurrency) expect(q.tasks.some((t) => t.stage === "race")).toBe(true);
      expect(q.cards.length).toBeGreaterThanOrEqual(3);
      expect(q.quiz.length).toBeGreaterThanOrEqual(1);
      expect(q.links.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("has unique task ids", () => {
    const ids = course.phases.flatMap((p) => [...p.quests.flatMap((q) => q.tasks.map((t) => t.id)), p.boss.id]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
