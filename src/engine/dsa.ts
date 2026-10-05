import { createEmptyCard } from "ts-fsrs";
import { addDays, diffDays, type DayKey } from "./day";
import { problemUrl, toSlug, type Difficulty, type DsaIndex } from "./dsa-track";
import { checkAchievements, checkDailyBonus, fromFsrs, grantXP, notify, today, type Ctx } from "./game";
import type { GameState, OrderItem, ProblemOutcome, SolvedProblem } from "./state";

// DSA track rules. Problems feed the same XP, stats, streak, and Daily Orders as the Go quests.

export const PROBLEM_XP: Record<Difficulty, number> = { easy: 8, medium: 15, hard: 30 };
export const GO_BONUS = 1.2;
export const HINT_MULT = 0.5;
export const FAILED_XP = 2;
export const REDO_DAYS: Record<Exclude<ProblemOutcome, "solved">, number> = { failed: 1, hint: 3 };
export const TARGET_MIN = 5;
export const TARGET_MAX = 20;

const counts = (p: SolvedProblem) => p.outcome !== "failed";

/** Plan day number (1-based) for `day`, or null if the challenge hasn't started. */
export function dsaDay(s: GameState, day: DayKey): number | null {
  const start = s.settings.dsa.start;
  if (!s.settings.dsa.enabled || !start) return null;
  return diffDays(day, start) + 1;
}

/** Which topic a plan day belongs to. Plans longer or shorter than the track stretch proportionally. */
export function topicForDay(dsa: DsaIndex, day: number, totalDays: number) {
  const plan = dsa.dayPlan;
  const i = Math.min(plan.length - 1, Math.max(0, Math.floor(((day - 1) * plan.length) / totalDays)));
  return dsa.topicById.get(plan[i])!;
}

export function uniqueSolved(s: GameState): Set<string> {
  return new Set(Object.values(s.problems).filter(counts).map((p) => p.slug));
}

/** Distinct problems solved on `day` (re-logging the same problem doesn't inflate the count). */
export function solvedOn(s: GameState, day: DayKey): number {
  return new Set(Object.values(s.problems).filter((p) => p.day === day && counts(p)).map((p) => p.slug)).size;
}

export interface Pace {
  day: number;
  daysTotal: number;
  daysLeft: number;
  solved: number;
  goal: number;
  /** Where a steady 10/day pace would be by the end of today. */
  expected: number;
  /** solved − expected (positive = ahead). */
  delta: number;
  target: number;
  todaySolved: number;
  finished: boolean;
}

export function pace(s: GameState, ctx: Ctx): Pace | null {
  const d = today(s, ctx);
  const day = dsaDay(s, d);
  if (day === null) return null;
  const { goal, days } = s.settings.dsa;
  const solved = uniqueSolved(s).size;
  const daysLeft = Math.max(1, days - day + 1);
  const expected = Math.min(goal, Math.round((goal * Math.min(day, days)) / days));
  const todaySolved = solvedOn(s, d);
  // Target for today: what's left divided by days left, counted from the start of today.
  const remainingAtDayStart = Math.max(0, goal - (solved - todaySolved));
  const target = remainingAtDayStart === 0 ? 0 : Math.min(TARGET_MAX, Math.max(Math.min(TARGET_MIN, remainingAtDayStart), Math.ceil(remainingAtDayStart / daysLeft)));
  return { day, daysTotal: days, daysLeft, solved, goal, expected, delta: solved - expected, target, todaySolved, finished: solved >= goal || day > days };
}

/** The Daily Orders item for today's DSA set, or null if the challenge isn't running. */
export function dsaOrderItem(s: GameState, ctx: Ctx, id: string): OrderItem | null {
  if (!ctx.dsa) return null;
  const p = pace(s, ctx);
  if (!p || p.finished || p.day < 1) return null;
  const topic = topicForDay(ctx.dsa, p.day, p.daysTotal);
  return {
    id,
    kind: "dsa",
    title: `DSA day ${p.day}/${p.daysTotal}: ${p.target} problems · ${topic.title}`,
    target: p.target,
    progress: Math.min(p.target, p.todaySolved),
    done: p.todaySolved >= p.target,
    optional: false,
    xp: 0,
    drill: 0,
  };
}

export function startDsa(s: GameState, ctx: Ctx, opts: { goal?: number; days?: number } = {}) {
  const d = today(s, ctx);
  s.settings.dsa = { enabled: true, start: d, goal: opts.goal ?? s.settings.dsa.goal, days: opts.days ?? s.settings.dsa.days };
  const o = s.orders[d];
  if (o && !o.items.some((i) => i.kind === "dsa")) {
    const it = dsaOrderItem(s, ctx, ctx.newId());
    if (it) {
      o.items.push(it);
      o.bonusGranted = false;
    }
  }
  const topic = ctx.dsa ? topicForDay(ctx.dsa, 1, s.settings.dsa.days) : null;
  notify(
    s, ctx, "info", "DSA CHALLENGE ACCEPTED",
    `${s.settings.dsa.goal} problems in ${s.settings.dsa.days} days. Day 1 topic: ${topic?.title ?? "arrays"}. Every problem feeds the same level, stats, and streak.`,
    true,
  );
}

export interface LogInput {
  problem: string; // URL, slug, or title
  title?: string;
  difficulty: Difficulty;
  outcome: ProblemOutcome;
  inGo: boolean;
  minutes?: number | null;
  topicId?: string;
}

export function problemXP(difficulty: Difficulty, outcome: ProblemOutcome, inGo: boolean, phaseIndex: number) {
  if (outcome === "failed") return FAILED_XP;
  const base = PROBLEM_XP[difficulty] * (1 + 0.05 * (phaseIndex - 1)) * (inGo ? GO_BONUS : 1);
  return Math.round(outcome === "hint" ? base * HINT_MULT : base);
}

export function logProblem(s: GameState, ctx: Ctx, input: LogInput): SolvedProblem | null {
  const dsa = ctx.dsa;
  const slug = toSlug(input.problem);
  if (!slug || !dsa) return null;
  const d = today(s, ctx);
  const anchor = dsa.anchorBySlug.get(slug);
  const p = pace(s, ctx);
  const topicId = input.topicId ?? anchor?.topicId ?? (p ? topicForDay(dsa, p.day, p.daysTotal).id : dsa.topics[0].id);
  const phaseIndex = dsa.phaseOfTopic.get(topicId)?.index ?? 1;
  const wasNew = !uniqueSolved(s).has(slug);

  // A new attempt closes any pending redo for the same problem.
  for (const prev of Object.values(s.problems)) {
    if (prev.slug === slug && prev.redoAt && !prev.redoneAt) prev.redoneAt = ctx.now.toISOString();
  }

  const xp = problemXP(input.difficulty, input.outcome, input.inGo, phaseIndex);
  const id = ctx.newId();
  const title = input.title?.trim() || anchor?.problem.title || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const entry: SolvedProblem = {
    id,
    slug,
    title,
    url: /^https?:\/\//.test(input.problem.trim()) ? input.problem.trim() : problemUrl(slug),
    difficulty: input.difficulty,
    topicId,
    outcome: input.outcome,
    inGo: input.inGo,
    minutes: input.minutes ?? null,
    at: ctx.now.toISOString(),
    day: d,
    xp,
    redoAt: input.outcome === "solved" ? null : new Date(ctx.now.getTime() + REDO_DAYS[input.outcome] * 86_400_000).toISOString(),
    redoneAt: null,
  };
  s.problems[id] = entry;

  const stats: Record<string, number> = { ALG: 1 };
  if (input.inGo) stats.FND = 0.2;
  const label = input.outcome === "solved" ? "" : input.outcome === "hint" ? " (with hint)" : " (attempt)";
  grantXP(s, ctx, xp, `DSA: ${title} · ${input.difficulty}${label}`, { ref: id, stats });

  // Advance today's DSA order.
  const o = s.orders[d];
  const item = o?.items.find((i) => i.kind === "dsa");
  if (item && counts(entry)) {
    item.progress = Math.min(item.target, solvedOn(s, d));
    item.xp += xp;
    if (!item.done && item.progress >= item.target) {
      item.done = true;
      notify(s, ctx, "cleared", "DSA TARGET MET", `${solvedOn(s, d)} problems today. Day ${p?.day ?? "?"} of ${s.settings.dsa.days} is done.`, false);
    }
  }

  // Milestones every 100 unique problems.
  const total = uniqueSolved(s).size;
  if (wasNew && counts(entry) && total % 100 === 0) {
    notify(s, ctx, "achievement", `MILESTONE: ${total} PROBLEMS`, `${s.settings.dsa.goal - total} to go.`, true);
  }
  checkDailyBonus(s, ctx);
  checkAchievements(s, ctx);
  return entry;
}

export function redoQueue(s: GameState, now: Date): SolvedProblem[] {
  return Object.values(s.problems)
    .filter((p) => p.redoAt && !p.redoneAt && new Date(p.redoAt) <= now)
    .sort((a, b) => a.redoAt!.localeCompare(b.redoAt!));
}

export const patternKey = (topicId: string) => `dsa:${topicId}`;

/** Mark a topic's pattern notes as studied: small XP, and its cards join the shared review deck. */
export function studyPattern(s: GameState, ctx: Ctx, topicId: string) {
  const t = ctx.dsa?.topicById.get(topicId);
  const key = patternKey(topicId);
  if (!t || s.progress[key]) return;
  s.progress[key] = { id: key, questId: topicId, completedAt: ctx.now.toISOString(), day: today(s, ctx), verify: "honor", xp: 10, sessions: 0 };
  grantXP(s, ctx, 10, `DSA pattern: ${t.title}`, { ref: key, stats: { ALG: 1 } });
  let made = 0;
  for (const c of t.cards) {
    if (s.cards[c.id]) continue;
    s.cards[c.id] = {
      id: c.id,
      questId: topicId,
      phaseIndex: 0, // eligible for interleaved drills alongside Go cards
      statId: "ALG",
      front: c.q,
      back: c.a,
      fsrs: fromFsrs(createEmptyCard(ctx.now)),
      createdAt: ctx.now.toISOString(),
    };
    made++;
  }
  if (made) notify(s, ctx, "info", "CARDS ADDED", `${made} pattern cards from "${t.title}" join your review deck.`);
  checkAchievements(s, ctx);
}

export const gateKey = (bossId: string) => `dsa:${bossId}`;

/** Timed set: pass with ≥ 75% of the problems within the time limit. */
export function submitGate(s: GameState, ctx: Ctx, phaseId: string, solved: number, minutes: number): boolean {
  const phase = ctx.dsa?.track.phases.find((p) => p.id === phaseId);
  if (!phase) return false;
  const key = gateKey(phase.boss.id);
  if (s.progress[key]) return true;
  const passed = solved >= Math.ceil(phase.boss.problems * 0.75) && minutes <= phase.boss.minutes;
  if (!passed) {
    notify(s, ctx, "info", "TRIAL NOT PASSED", `${solved}/${phase.boss.problems} in ${minutes} min. You need ${Math.ceil(phase.boss.problems * 0.75)} within ${phase.boss.minutes} min. Try a fresh set another day.`, true);
    return false;
  }
  const xp = Math.round(150 * (1 + 0.1 * (phase.index - 1)));
  s.progress[key] = { id: key, questId: phase.id, completedAt: ctx.now.toISOString(), day: today(s, ctx), verify: "honor", xp, sessions: 0 };
  notify(s, ctx, "boss", "DSA GATE CLEARED", `"${phase.boss.title}": ${solved}/${phase.boss.problems} in ${minutes} min.`, true);
  grantXP(s, ctx, xp, `DSA Gate Trial: ${phase.boss.title}`, { ref: key, stats: { ALG: 1 } });
  checkAchievements(s, ctx);
  return true;
}

/** Problems logged per plan day, for the 100-day heatmap. */
export function dailyCounts(s: GameState): Map<DayKey, number> {
  const m = new Map<DayKey, number>();
  for (const p of Object.values(s.problems)) if (counts(p)) m.set(p.day, (m.get(p.day) ?? 0) + 1);
  return m;
}

export const planDayKey = (start: DayKey, day: number) => addDays(start, day - 1);
