import { createEmptyCard, fsrs, type Card, type Grade } from "ts-fsrs";
import { ACHIEVEMENTS } from "./achievements";
import type { CourseIndex, Quest, Task } from "./course";
import { addDays, dayEnd, dayKey, diffDays, type DayKey } from "./day";
import { has, type MethodId } from "./methods";
import {
  DAILY_BONUS,
  RANK_IDS,
  READ_XP_CAP_PER_DAY,
  REPAIR_WINDOW_HOURS,
  REST_TOKEN_EVERY,
  SEVERITIES,
  STASIS_MAX_DAYS,
  decayAmount,
  levelFromXP,
  pomodoroMult,
  qualifyingRank,
  rankDef,
  rankFloorXP,
  rankIndex,
  taskXP,
  type Verify,
} from "./rules";
import type {
  CardRec,
  DailyOrders,
  GameState,
  LogKind,
  NoticeKind,
  OrderItem,
  Penalty,
  SerializedFsrs,
  Settings,
} from "./state";

// Game rules as mutations on an immer draft. Every function takes the same context so
// tests can pin the clock and ids.

export interface Ctx {
  idx: CourseIndex;
  now: Date;
  newId: () => string;
}

const scheduler = fsrs({ enable_fuzz: false });

// ---------- small helpers ----------

export const today = (s: GameState, ctx: Ctx) => dayKey(ctx.now, s.settings.dayBoundaryHour);
export const openPenalty = (s: GameState): Penalty | undefined =>
  Object.values(s.penalties).find((p) => !p.clearedAt);
const sev = (s: GameState) => SEVERITIES[s.settings.severity];
const methods = (s: GameState): MethodId[] => s.settings.methods;

export function notify(s: GameState, ctx: Ctx, kind: NoticeKind, title: string, body: string, important = false) {
  const id = ctx.newId();
  s.notices[id] = { id, at: ctx.now.toISOString(), kind, title, body, read: false, important };
}

function log(s: GameState, ctx: Ctx, kind: LogKind, delta: number, reason: string, ref?: string) {
  const id = ctx.newId();
  s.log[id] = {
    id,
    at: ctx.now.toISOString(),
    day: today(s, ctx),
    kind,
    delta,
    balance: s.player.xp,
    reason,
    ...(ref ? { ref } : {}),
  };
}

export const toFsrs = (c: SerializedFsrs) => ({
  ...c,
  due: new Date(c.due),
  last_review: c.last_review ? new Date(c.last_review) : undefined,
});

function fromFsrs(c: Card): SerializedFsrs {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    ...(c.last_review ? { last_review: c.last_review.toISOString() } : {}),
  };
}

export function retrievability(card: CardRec, now: Date): number {
  if (card.fsrs.reps === 0) return 0;
  return scheduler.get_retrievability(toFsrs(card.fsrs), now, false);
}

export function dueCards(s: GameState, before: Date): CardRec[] {
  return Object.values(s.cards)
    .filter((c) => new Date(c.fsrs.due) <= before)
    .sort((a, b) => a.fsrs.due.localeCompare(b.fsrs.due));
}

export const isDone = (s: GameState, taskId: string) => Boolean(s.progress[taskId]);

export function questComplete(s: GameState, q: Quest) {
  return q.tasks.every((t) => isDone(s, t.id));
}

/** The next task in course order that isn't done yet. */
export function nextTask(s: GameState, idx: CourseIndex): Task | undefined {
  return idx.orderedTasks.find((t) => !isDone(s, t.id));
}

export function currentPhaseIndex(s: GameState, idx: CourseIndex): number {
  const t = nextTask(s, idx);
  return t ? idx.phaseIndexOfTask.get(t.id)! : idx.course.phases.length;
}

// ---------- XP, levels, ranks ----------

function ascended(s: GameState, ctx: Ctx): boolean {
  const cards = Object.values(s.cards);
  if (s.player.bossPhases.length < ctx.idx.course.phases.length || cards.length === 0) return false;
  return cards.filter((c) => c.fsrs.stability >= 30).length / cards.length >= 0.9;
}

export function updateRank(s: GameState, ctx: Ctx) {
  const level = levelFromXP(s.player.xp);
  let target = qualifyingRank(level, s.player.bossPhases, ascended(s, ctx));
  if (s.player.rankLock && rankIndex(target) >= rankIndex(s.player.rankLock)) {
    target = RANK_IDS[rankIndex(s.player.rankLock) - 1];
  }
  if (rankIndex(target) > rankIndex(s.player.rank)) {
    s.player.rank = target;
    log(s, ctx, "rank", 0, `Promoted to ${rankDef(target).name}`);
    notify(s, ctx, "rank", `RANK UP: ${target}`, `You are now ${rankDef(target).name}.`, true);
  }
}

function applyXP(s: GameState, ctx: Ctx, amount: number, kind: LogKind, reason: string, ref?: string) {
  const before = levelFromXP(s.player.xp);
  s.player.xp += amount;
  log(s, ctx, kind, amount, reason, ref);
  const after = levelFromXP(s.player.xp);
  if (after > before) {
    notify(s, ctx, "levelup", "LEVEL UP", `You reached level ${after}.`, true);
  }
  updateRank(s, ctx);
}

/** Grant XP, or hold it in escrow while a Penalty Quest is open. Stats always grow. */
export function grantXP(
  s: GameState,
  ctx: Ctx,
  amount: number,
  reason: string,
  opts: { ref?: string; stats?: Record<string, number>; kind?: LogKind } = {},
) {
  if (amount <= 0) return;
  for (const [stat, w] of Object.entries(opts.stats ?? {})) {
    s.player.statXP[stat] = (s.player.statXP[stat] ?? 0) + amount * w;
  }
  if (openPenalty(s)) {
    s.player.escrowXP += amount;
    log(s, ctx, "escrow", amount, `${reason} (held until the Penalty Quest is cleared)`, opts.ref);
    return;
  }
  applyXP(s, ctx, amount, opts.kind ?? "xp", reason, opts.ref);
}

// ---------- Daily Orders ----------

function item(ctx: Ctx, p: Omit<OrderItem, "id" | "progress" | "done" | "xp" | "drill" | "optional"> & Partial<OrderItem>): OrderItem {
  return { id: ctx.newId(), progress: 0, done: false, xp: 0, drill: 0, optional: false, ...p };
}

export function drillCards(s: GameState, ctx: Ctx, exclude: Set<string>, count: number): CardRec[] {
  const phase = currentPhaseIndex(s, ctx.idx);
  const confusable = new Set<string>();
  const cur = nextTask(s, ctx.idx);
  const q = cur ? ctx.idx.questById.get(cur.questId) : undefined;
  q?.confusable.forEach((c) => confusable.add(c));
  return Object.values(s.cards)
    .filter((c) => c.phaseIndex < phase && !exclude.has(c.id))
    .map((c) => ({ c, score: (confusable.has(c.questId) ? -1 : 0) + retrievability(c, ctx.now) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((x) => x.c);
}

export function generateOrders(s: GameState, ctx: Ctx, day: DayKey) {
  const m = methods(s);
  const items: OrderItem[] = [];

  if (has(m, "srs")) {
    const due = dueCards(s, dayEnd(day, s.settings.dayBoundaryHour));
    const target = Math.min(due.length, s.settings.reviewCap);
    let drill = 0;
    if (has(m, "interleave") && currentPhaseIndex(s, ctx.idx) >= 3) {
      drill = drillCards(s, ctx, new Set(due.map((c) => c.id)), 5).length;
    }
    if (target + drill > 0) {
      items.push(item(ctx, {
        kind: "review",
        title: drill ? `Review ${target} due cards + ${drill}-card mixed drill` : `Review ${target} due cards`,
        target: target + drill,
        drill,
      }));
    }
  }

  const remaining = ctx.idx.orderedTasks.filter((t) => !isDone(s, t.id));
  const cur = remaining[0];
  if (cur) {
    const sameUnit = remaining.filter((t) => t.questId === cur.questId);
    const concept = sameUnit.find((t) => t.type === "read");
    const build = sameUnit.find((t) => t.type !== "read" && t.type !== "reflect") ?? sameUnit.find((t) => t.type === "reflect");
    const project = has(m, "project");
    const conceptItem = concept && item(ctx, { kind: "concept", title: concept.title, taskId: concept.id, target: 1, optional: project && Boolean(build) });
    const buildItem = build && item(ctx, { kind: "build", title: build.title, taskId: build.id, target: 1 });
    if (project) {
      if (buildItem) items.push(buildItem);
      if (conceptItem) items.push(conceptItem);
    } else {
      if (conceptItem) items.push(conceptItem);
      if (buildItem) items.push(buildItem);
    }
  }

  if (has(m, "reflection")) {
    items.push(item(ctx, { kind: "reflect", title: "Daily reflection: build, surprise, next", target: 1 }));
  }

  s.orders[day] = { id: day, items, bonusGranted: false, met: null, tokenUsed: false, repaired: false };
  const summary = items.map((i) => `• ${i.title}${i.optional ? " (optional)" : ""}`).join("\n");
  notify(s, ctx, "orders", "DAILY ORDERS ISSUED", summary || "Nothing due today. Rest well.", !s.settings.quietMode);
}

export function isMet(o: DailyOrders | undefined): boolean {
  if (!o) return false;
  if (o.items.length === 0) return true;
  const work = o.items.filter((i) => i.kind !== "review" && !i.optional);
  const reviews = o.items.filter((i) => i.kind === "review");
  const workOk = work.length === 0 || work.some((i) => i.done);
  const reviewOk = reviews.every((i) => i.progress >= Math.ceil(0.8 * i.target));
  return workOk && reviewOk;
}

function checkDailyBonus(s: GameState, ctx: Ctx) {
  const o = s.orders[today(s, ctx)];
  if (!o || o.bonusGranted || o.items.length === 0) return;
  if (!o.items.filter((i) => !i.optional).every((i) => i.done)) return;
  o.bonusGranted = true;
  const bonus = Math.round(o.items.reduce((a, i) => a + i.xp, 0) * DAILY_BONUS);
  notify(s, ctx, "cleared", "DAILY ORDERS COMPLETE", bonus ? `Completion bonus: +${bonus} XP.` : "All orders cleared.", !s.settings.quietMode);
  grantXP(s, ctx, bonus, "Daily Orders completion bonus", { kind: "bonus" });
}

// ---------- days, penalties, decay ----------

function issuePenalty(s: GameState, ctx: Ctx, missedDay: DayKey) {
  const reviewTarget = Math.min(30, dueCards(s, ctx.now).length);
  const small = ctx.idx.orderedTasks.find((t) => !isDone(s, t.id) && t.type !== "boss");
  const id = ctx.newId();
  s.penalties[id] = {
    id,
    issuedAt: ctx.now.toISOString(),
    deadline: new Date(ctx.now.getTime() + REPAIR_WINDOW_HOURS * 3600_000).toISOString(),
    forDays: [missedDay],
    reviewTarget,
    reviewProgress: 0,
    taskId: small?.id ?? null,
    taskDone: false,
    needsReflection: reviewTarget === 0 && !small,
    reflectionDone: false,
    clearedAt: null,
    repaired: false,
  };
  log(s, ctx, "penalty", 0, `Penalty Quest issued for ${missedDay}`);
  const parts = [
    reviewTarget ? `${reviewTarget} overdue reviews` : null,
    small ? `the task "${small.title}"` : null,
    reviewTarget === 0 && !small ? "a reflection" : null,
  ].filter(Boolean);
  notify(
    s, ctx, "penalty", "PENALTY QUEST",
    `You missed ${s.player.missedStreak} day(s) past your grace period. Clear ${parts.join(" and ")}. ` +
      `XP you earn meanwhile is held, not lost. Clear it within ${REPAIR_WINDOW_HOURS} h to repair your streak.`,
    true,
  );
}

export function checkPenalty(s: GameState, ctx: Ctx) {
  const p = openPenalty(s);
  if (!p) return;
  const done =
    p.reviewProgress >= p.reviewTarget &&
    (p.taskId === null || p.taskDone) &&
    (!p.needsReflection || p.reflectionDone);
  if (!done) return;
  p.clearedAt = ctx.now.toISOString();
  p.repaired = ctx.now <= new Date(p.deadline);
  if (p.repaired) {
    for (const d of p.forDays) {
      s.orders[d] ??= { id: d, items: [], bonusGranted: false, met: false, tokenUsed: false, repaired: false };
      s.orders[d].repaired = true;
    }
  }
  s.player.missedStreak = 0;
  s.player.daysAtFloor = 0;
  const released = s.player.escrowXP;
  s.player.escrowXP = 0;
  notify(
    s, ctx, "cleared", "PENALTY CLEARED",
    (released ? `${released} held XP released. ` : "") + (p.repaired ? "Streak repaired." : "Decay has stopped."),
    true,
  );
  if (released) applyXP(s, ctx, released, "release", "Held XP released");
}

function evaluateDay(s: GameState, ctx: Ctx, d: DayKey) {
  const o = s.orders[d];
  const def = sev(s);
  if (o?.tokenUsed) return;
  const met = isMet(o);
  if (o) o.met = met;

  if (met) {
    s.player.missedStreak = 0;
    s.player.metStreak += 1;
    s.player.bestStreak = Math.max(s.player.bestStreak, s.player.metStreak);
    s.player.metSinceToken += 1;
    if (s.player.metSinceToken >= REST_TOKEN_EVERY) {
      s.player.metSinceToken = 0;
      if (s.player.restTokens < def.maxTokens) {
        s.player.restTokens += 1;
        log(s, ctx, "token", 0, "Earned a Rest Token (7 days met)");
        notify(s, ctx, "info", "REST TOKEN EARNED", `You now hold ${s.player.restTokens}.`);
      }
    }
    return;
  }

  s.player.metStreak = 0;
  if (s.settings.autoUseTokens && s.player.restTokens > 0) {
    s.player.restTokens -= 1;
    s.orders[d] ??= { id: d, items: [], bonusGranted: false, met: false, tokenUsed: false, repaired: false };
    s.orders[d].tokenUsed = true;
    log(s, ctx, "token", 0, `Rest Token covered ${d}`);
    notify(s, ctx, "info", "REST TOKEN USED", `${d} was covered by a Rest Token. ${s.player.restTokens} left.`);
    return;
  }

  s.player.missedStreak += 1;
  const over = s.player.missedStreak - def.grace;
  if (over < 1) {
    notify(s, ctx, "info", "GRACE DAY", `${d} missed. It's inside your grace period, so nothing is lost.`);
    return;
  }

  const p = openPenalty(s);
  if (p) p.forDays.push(d);
  else issuePenalty(s, ctx, d);

  const level = levelFromXP(s.player.xp);
  const floor = rankFloorXP(s.player.rank);
  const amount = decayAmount(def, over, level);
  const next = Math.max(floor, s.player.xp - amount);
  const lost = s.player.xp - next;
  if (lost > 0) {
    s.player.xp = next;
    log(s, ctx, "decay", -lost, `Decay: ${d} missed, ${over} day(s) past grace (${def.name})`);
  }
  if (def.demoteAfter !== null && def.decayRate > 0 && s.player.xp <= floor) {
    s.player.daysAtFloor += 1;
    if (s.player.daysAtFloor >= def.demoteAfter && rankIndex(s.player.rank) > 0) {
      const from = s.player.rank;
      const to = RANK_IDS[rankIndex(from) - 1];
      s.player.rank = to;
      s.player.rankLock = from;
      s.player.daysAtFloor = 0;
      log(s, ctx, "rank", 0, `Demoted from ${from} to ${to}`);
      notify(s, ctx, "rank", `RANK LOST: ${from} → ${to}`, `Clear the Re-Ascension Trial (a review session scoring 80%+) to restore ${from}.`, true);
    }
  }
}

/** Bring the state up to "now": end stasis, evaluate finished days, issue today's orders. */
export function rollover(s: GameState, ctx: Ctx) {
  if (!s.player.onboarded) return;
  const day = today(s, ctx);

  if (s.player.stasis && ctx.now >= new Date(s.player.stasis.until)) endStasis(s, ctx);
  if (s.player.stasis) {
    s.player.lastProcessedDay = day;
    return;
  }

  if (!s.player.lastProcessedDay) s.player.lastProcessedDay = day;
  let d = s.player.lastProcessedDay;
  // Cap the catch-up so a year away doesn't loop forever; the floor stops decay anyway.
  let guard = 400;
  while (diffDays(day, d) > 0 && guard-- > 0) {
    evaluateDay(s, ctx, d);
    d = addDays(d, 1);
  }
  s.player.lastProcessedDay = day;
  if (!s.orders[day]) generateOrders(s, ctx, day);
}

// ---------- player actions ----------

export function onboard(
  s: GameState,
  ctx: Ctx,
  input: { name: string; methods: MethodId[]; severity: Settings["severity"]; intention: string; dayBoundaryHour: number },
) {
  s.player.name = input.name.trim() || "Learner";
  s.settings.methods = input.methods;
  s.settings.severity = input.severity;
  s.settings.intention = input.intention;
  s.settings.dayBoundaryHour = input.dayBoundaryHour;
  s.player.onboarded = true;
  s.player.lastProcessedDay = today(s, ctx);
  notify(s, ctx, "info", "PLAYER REGISTERED", `Welcome, ${s.player.name}. The Registry will issue orders every day at ${input.dayBoundaryHour}:00.`, true);
  generateOrders(s, ctx, today(s, ctx));
}

function createCards(s: GameState, ctx: Ctx, q: Quest) {
  const phaseIndex = ctx.idx.phaseById.get(q.phaseId)!.index;
  const statId = Object.entries(q.stats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "FND";
  let made = 0;
  for (const c of q.cards) {
    if (s.cards[c.id]) continue;
    s.cards[c.id] = {
      id: c.id,
      questId: q.id,
      phaseIndex,
      statId,
      front: c.q,
      back: c.a,
      fsrs: fromFsrs(createEmptyCard(ctx.now)),
      createdAt: ctx.now.toISOString(),
    };
    made++;
  }
  if (made) notify(s, ctx, "info", "CARDS ADDED", `${made} review cards from "${q.title}" join your deck.`);
}

function understandDone(s: GameState, q: Quest) {
  const reads = q.tasks.filter((t) => t.stage === "understand");
  return reads.length > 0 && reads.every((t) => isDone(s, t.id));
}

export function backfillCards(s: GameState, ctx: Ctx) {
  if (!has(methods(s), "srs")) return;
  for (const q of ctx.idx.quests) if (understandDone(s, q)) createCards(s, ctx, q);
}

export function completeTask(s: GameState, ctx: Ctx, taskId: string, input: { verify: Verify; sessions?: number }) {
  const task = ctx.idx.taskById.get(taskId);
  if (!task || isDone(s, taskId)) return;
  const day = today(s, ctx);
  const phaseIndex = ctx.idx.phaseIndexOfTask.get(taskId)!;
  const sessions = input.sessions ?? 0;
  const m = methods(s);

  const methodMult = has(m, "pomodoro") && (task.type === "implement" || task.type === "test") ? pomodoroMult(sessions, task.sessions ?? 1) : 1;
  let xp = taskXP({ type: task.type, phaseIndex, verify: input.verify, methodMult });
  const readsToday = Object.values(s.progress).filter((p) => p.day === day && ctx.idx.taskById.get(p.id)?.type === "read").length;
  const capped = task.type === "read" && readsToday >= READ_XP_CAP_PER_DAY;
  if (capped) xp = 0;

  s.progress[taskId] = {
    id: taskId,
    questId: task.questId,
    completedAt: ctx.now.toISOString(),
    day,
    verify: input.verify,
    xp,
    sessions,
  };
  if (capped) log(s, ctx, "xp", 0, `${task.title} (daily read XP cap reached)`, taskId);
  grantXP(s, ctx, xp, task.title, { ref: taskId, stats: task.stats });

  const o = s.orders[day];
  o?.items.forEach((i) => {
    if (i.taskId === taskId && !i.done) {
      i.done = true;
      i.progress = 1;
      i.xp = xp;
    }
  });

  if (task.type === "boss") {
    s.player.bossesCleared.push(task.id);
    s.player.bossPhases.push(phaseIndex);
    notify(s, ctx, "boss", "GATE TRIAL CLEARED", `"${task.title}" passed. Phase ${phaseIndex} is conquered.`, true);
    updateRank(s, ctx);
  } else {
    const q = ctx.idx.questById.get(task.questId)!;
    if (has(m, "srs") && task.stage === "understand" && understandDone(s, q)) createCards(s, ctx, q);
    if (questComplete(s, q)) notify(s, ctx, "quest", "QUEST COMPLETE", `Quest ${q.index}: "${q.title}" cleared every stage.`, !s.settings.quietMode);
  }

  const p = openPenalty(s);
  if (p && p.taskId === taskId) {
    p.taskDone = true;
    checkPenalty(s, ctx);
  }
  checkDailyBonus(s, ctx);
  checkAchievements(s, ctx);
}

export function reviewCard(s: GameState, ctx: Ctx, cardId: string, rating: Grade, opts: { trial?: boolean } = {}) {
  const card = s.cards[cardId];
  if (!card) return;
  const res = scheduler.next(toFsrs(card.fsrs), ctx.now, rating);
  card.fsrs = fromFsrs(res.card);
  const id = ctx.newId();
  s.reviews[id] = { id, cardId, at: ctx.now.toISOString(), day: today(s, ctx), rating: rating as 1 | 2 | 3 | 4 };
  s.player.totalReviews += 1;
  const xp = rating === 1 ? 1 : 3;
  grantXP(s, ctx, xp, `Review: ${card.front.slice(0, 48)}`, { ref: cardId, stats: { [card.statId]: 1 } });

  if (!opts.trial) {
    const o = s.orders[today(s, ctx)];
    const r = o?.items.find((i) => i.kind === "review" && !i.done);
    if (r) {
      r.progress += 1;
      r.xp += xp;
      if (r.progress >= r.target) r.done = true;
    }
    const p = openPenalty(s);
    if (p && p.reviewProgress < p.reviewTarget) {
      p.reviewProgress += 1;
      checkPenalty(s, ctx);
    }
  }
  checkDailyBonus(s, ctx);
  checkAchievements(s, ctx);
}

/** Re-Ascension Trial: a review session after demotion. 80%+ Good/Easy lifts the rank lock. */
export function finishTrial(s: GameState, ctx: Ctx, ratings: Grade[]) {
  if (!s.player.rankLock || ratings.length < 10) return false;
  const passRate = ratings.filter((r) => r >= 3).length / ratings.length;
  if (passRate < 0.8) {
    notify(s, ctx, "info", "TRIAL FAILED", `${Math.round(passRate * 100)}% recalled. You need 80%. Try again tomorrow.`, true);
    return false;
  }
  const lock = s.player.rankLock;
  s.player.rankLock = null;
  s.player.rank = lock;
  s.player.xp = Math.max(s.player.xp, rankFloorXP(lock));
  log(s, ctx, "rank", 0, `Re-Ascension Trial cleared: rank ${lock} restored`);
  notify(s, ctx, "rank", `RANK RESTORED: ${lock}`, "A fresh start. The Registry remembers the comeback, not the fall.", true);
  return true;
}

export function writeReflection(s: GameState, ctx: Ctx, answers: string[], opts: { taskId?: string; kind?: "daily" | "task" | "feynman" } = {}) {
  const id = ctx.newId();
  const kind = opts.kind ?? (opts.taskId ? "task" : "daily");
  s.reflections[id] = { id, at: ctx.now.toISOString(), day: today(s, ctx), kind, ...(opts.taskId ? { taskId: opts.taskId } : {}), answers };
  if (kind !== "daily") return;

  const o = s.orders[today(s, ctx)];
  const r = o?.items.find((i) => i.kind === "reflect" && !i.done);
  if (r) {
    const xp = taskXP({ type: "reflect", phaseIndex: currentPhaseIndex(s, ctx.idx), verify: "honor" });
    r.done = true;
    r.progress = 1;
    r.xp = xp;
    grantXP(s, ctx, xp, "Daily reflection", { stats: { FND: 0.2 } });
  }
  const p = openPenalty(s);
  if (p && p.needsReflection) {
    p.reflectionDone = true;
    checkPenalty(s, ctx);
  }
  checkDailyBonus(s, ctx);
  checkAchievements(s, ctx);
}

export function recordAttempt(s: GameState, ctx: Ctx, taskId: string, kind: "recall" | "evidence", payload: Record<string, unknown>, passed: boolean) {
  const id = ctx.newId();
  s.attempts[id] = { id, taskId, at: ctx.now.toISOString(), kind, payload, passed };
}

export function recordSession(s: GameState, ctx: Ctx, taskId: string, start: Date, completed: boolean) {
  const id = ctx.newId();
  s.sessions[id] = { id, taskId, start: start.toISOString(), end: ctx.now.toISOString(), completed };
  checkAchievements(s, ctx);
}

export function completedSessions(s: GameState, taskId: string) {
  return Object.values(s.sessions).filter((x) => x.taskId === taskId && x.completed).length;
}

/** Spend a Rest Token on today, before the day ends. */
export function spendRestToken(s: GameState, ctx: Ctx) {
  const day = today(s, ctx);
  const o = s.orders[day];
  if (s.player.restTokens < 1 || !o || o.tokenUsed || isMet(o)) return false;
  s.player.restTokens -= 1;
  o.tokenUsed = true;
  log(s, ctx, "token", 0, `Rest Token used on ${day}`);
  notify(s, ctx, "info", "REST DAY", "Today is covered. Recovery is part of training.");
  return true;
}

export function startStasis(s: GameState, ctx: Ctx, days: number) {
  if (s.player.stasis) return false;
  if (s.player.stasisCooldownUntil && ctx.now < new Date(s.player.stasisCooldownUntil)) return false;
  const n = Math.max(1, Math.min(STASIS_MAX_DAYS, Math.round(days)));
  s.player.stasis = { since: ctx.now.toISOString(), until: new Date(ctx.now.getTime() + n * 86_400_000).toISOString() };
  log(s, ctx, "stasis", 0, `Stasis for ${n} day(s)`);
  notify(s, ctx, "info", "STASIS ENGAGED", `Timers frozen for up to ${n} day(s). Card due dates will shift when you return.`, true);
  return true;
}

export function endStasis(s: GameState, ctx: Ctx) {
  const st = s.player.stasis;
  if (!st) return;
  const end = new Date(Math.min(ctx.now.getTime(), new Date(st.until).getTime()));
  const shiftMs = end.getTime() - new Date(st.since).getTime();
  for (const c of Object.values(s.cards)) {
    c.fsrs.due = new Date(new Date(c.fsrs.due).getTime() + shiftMs).toISOString();
  }
  s.player.stasis = null;
  s.player.stasisCooldownUntil = new Date(ctx.now.getTime() + 7 * 86_400_000).toISOString();
  s.player.lastProcessedDay = dayKey(end, s.settings.dayBoundaryHour);
  log(s, ctx, "stasis", 0, "Stasis ended");
  notify(s, ctx, "info", "STASIS RELEASED", "Welcome back. Your orders resume today.", true);
}

export function updateSettings(s: GameState, ctx: Ctx, patch: Partial<Settings>) {
  const hadSrs = has(s.settings.methods, "srs");
  Object.assign(s.settings, patch);
  if (!hadSrs && has(s.settings.methods, "srs")) backfillCards(s, ctx);
}

export function setTitle(s: GameState, title: string | null) {
  s.player.title = title;
}

export function markNoticesRead(s: GameState, ids?: string[]) {
  for (const n of Object.values(s.notices)) if (!ids || ids.includes(n.id)) n.read = true;
}

export function checkAchievements(s: GameState, ctx: Ctx) {
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id] || !a.check(s, ctx.idx)) continue;
    s.achievements[a.id] = { id: a.id, at: ctx.now.toISOString() };
    if (a.title && !s.player.title) s.player.title = a.title;
    notify(s, ctx, "achievement", `ACHIEVEMENT: ${a.name}`, a.description + (a.title ? ` Title unlocked: "${a.title}".` : ""), true);
  }
}

/** When each rating would schedule the card next, for the review buttons. */
export function previewIntervals(card: CardRec, now: Date): Record<1 | 2 | 3 | 4, Date> {
  const r = scheduler.repeat(toFsrs(card.fsrs), now);
  return { 1: r[1].card.due, 2: r[2].card.due, 3: r[3].card.due, 4: r[4].card.due };
}

/** Lowest-stability cards, used for the Re-Ascension Trial. */
export function trialCards(s: GameState, count = 12): CardRec[] {
  return Object.values(s.cards)
    .filter((c) => c.fsrs.reps > 0)
    .sort((a, b) => a.fsrs.stability - b.fsrs.stability)
    .slice(0, count);
}
