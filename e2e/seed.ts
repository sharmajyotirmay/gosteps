import { produce } from "immer";
import { join } from "node:path";
import { Rating } from "ts-fsrs";
import { buildCourse } from "../scripts/build-course";
import { indexCourse } from "../src/engine/course";
import { buildDsa } from "../scripts/build-dsa";
import { indexDsa } from "../src/engine/dsa-track";
import { logProblem, startDsa, studyPattern, topicForDay } from "../src/engine/dsa";
import { completeTask, markNoticesRead, today, onboard, reviewCard, rollover, writeReflection, type Ctx } from "../src/engine/game";
import { initialState, type GameState } from "../src/engine/state";
import { makeBundle } from "../src/storage/adapter";

// Plays ~two weeks of study through the real engine, ending at `end`, for README screenshots.
export function demoBundle(end = new Date()) {
  const idx = indexCourse(buildCourse(join(import.meta.dirname, "../curriculum/go")));
  const dsa = indexDsa(buildDsa(join(import.meta.dirname, "../curriculum/dsa")));
  // Verified anchor problems in plan order: the demo learner works through them day by day.
  const anchors = dsa.topics.flatMap((t) => t.problems.map((p) => ({ ...p, topicId: t.id })));
  let nextAnchor = 0;
  let n = 0;
  const DAYS = 14;
  // Each study session starts 3 h before `end`'s clock time, so the last one is already in the past.
  const start = new Date(end.getTime() - DAYS * 86_400_000 - 3 * 3600_000);
  const at = (day: number, hoursLater: number) => new Date(start.getTime() + day * 86_400_000 + hoursLater * 3600_000);
  const step = (s: GameState, now: Date, fn: (d: GameState, c: Ctx) => void) =>
    produce(s, (d) => fn(d, { idx, dsa, now, newId: () => `demo-${++n}` }));

  let s = initialState("go", start);
  s = step(s, start, (d, c) => {
    onboard(d, c, {
      name: "Jyotirmay",
      methods: ["srs", "recall", "pomodoro", "reflection", "interleave", "feynman"],
      severity: "standard",
      intention: "After dinner at my desk, I open the jobq repo.",
      dayBoundaryHour: 4,
    });
    d.settings.theme = "dark";
    startDsa(d, c);
  });

  for (let day = 0; day <= DAYS; day++) {
    const last = day === DAYS;
    const t = at(day, 0);
    s = step(s, t, rollover);
    // Reviews first, the way the app suggests: clear the whole review order (due + mixed drill).
    // The last day skips reviews so some cards are still due in the screenshots.
    const order = s.orders[today(s, { idx, now: t, newId: () => "" })]?.items.find((i) => i.kind === "review");
    const due = last || !order ? [] : Object.values(s.cards).sort((a, b) => a.fsrs.due.localeCompare(b.fsrs.due)).slice(0, order.target);
    for (const [i, c] of due.entries()) {
      s = step(s, new Date(t.getTime() + i * 30_000), (d, ctx) => reviewCard(d, ctx, c.id, i % 7 === 3 ? Rating.Hard : Rating.Good));
    }
    // DSA: study the day's pattern, then log problems (about 9 a day, slightly behind pace; a few with hints).
    const topic = topicForDay(dsa, day + 1, 100);
    s = step(s, new Date(t.getTime() + 30_000), (d, c) => studyPattern(d, c, topic.id));
    const quota = last ? 4 : 8 + (day % 3);
    for (let k = 0; k < quota && nextAnchor < anchors.length; k++) {
      const a = anchors[nextAnchor++];
      const outcome = k % 6 === 5 ? "hint" : "solved";
      s = step(s, new Date(t.getTime() + 60_000 + k * 90_000), (d, c) => {
        logProblem(d, c, { problem: a.slug, difficulty: a.difficulty, outcome, inGo: k % 4 !== 3, minutes: 10 + ((k * 7) % 25), topicId: a.topicId });
      });
    }
    // Then work through the course in order. The last day stops at the start of a quest,
    // so the screenshots show the active-recall gate on its first read task.
    const budget = last ? 8 : 6;
    for (let k = 0; k < budget; k++) {
      const task = idx.orderedTasks.find((x) => !s.progress[x.id]);
      if (!task) break;
      if (last && task.type === "read" && idx.questById.get(task.questId)?.tasks[0].id === task.id) break;
      const when = new Date(t.getTime() + (k + 1) * 25 * 60_000);
      s = step(s, when, (d, ctx) => {
        const evidence = task.evidence.length > 0;
        completeTask(d, ctx, task.id, { verify: evidence ? "evidence" : "honor", sessions: task.sessions ?? 1 });
      });
    }
    if (!last) s = step(s, at(day, 2.5), (d, c) => writeReflection(d, c, ["Built the next piece of jobq.", "Channels surprised me.", "Finish the quest tomorrow."]));
  }
  // Leave only the newest important notice unread so the System window has something to show.
  s = step(s, end, (d) => {
    const latest = Object.values(d.notices)
      .filter((x) => x.kind === "levelup" || x.kind === "rank" || x.kind === "boss")
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    markNoticesRead(d);
    if (latest) latest.read = false;
  });
  return makeBundle(s, end);
}
