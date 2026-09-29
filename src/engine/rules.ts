import type { Task } from "./course";

// XP, level, rank and severity rules. See docs/DESIGN.md §3 for the formulas and worked examples.

export type Verify = "honor" | "evidence" | "github";
export type Severity = "gentle" | "standard" | "hardcore";

export const BASE_XP: Record<Task["type"], number> = {
  read: 10,
  reflect: 15,
  review: 3,
  test: 25,
  implement: 30,
  boss: 250,
};

export const VERIFY_MULT: Record<Verify, number> = { honor: 1, evidence: 1.25, github: 1.4 };
export const DAILY_BONUS = 0.2;
export const READ_XP_CAP_PER_DAY = 3;

export const phaseMult = (phaseIndex: number) => 1 + 0.15 * (phaseIndex - 1);

/** Pomodoro multiplier: full XP once the estimated sessions are done, never below half. */
export function pomodoroMult(sessions: number, estSessions: number): number {
  return Math.max(0.5, Math.min(1, sessions / Math.max(1, estSessions))) + 0.05 * sessions;
}

export function taskXP(opts: {
  type: Task["type"];
  phaseIndex: number;
  verify: Verify;
  methodMult?: number;
}): number {
  return Math.round(BASE_XP[opts.type] * phaseMult(opts.phaseIndex) * VERIFY_MULT[opts.verify] * (opts.methodMult ?? 1));
}

export const xpToNext = (level: number) => 50 + 25 * level;
export const cumulativeXP = (level: number) => 50 * (level - 1) + 12.5 * level * (level - 1);

export function levelFromXP(xp: number): number {
  let level = 1;
  while (cumulativeXP(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp: number) {
  const level = levelFromXP(xp);
  const into = xp - cumulativeXP(level);
  return { level, into, need: xpToNext(level) };
}

export const RANK_IDS = ["E", "D", "C", "B", "A", "S", "Ω"] as const;
export type RankId = (typeof RANK_IDS)[number];

export interface RankDef {
  id: RankId;
  name: string;
  minLevel: number;
  /** Phase index whose boss must be cleared. */
  bossPhase: number | null;
}

export const RANKS: RankDef[] = [
  { id: "E", name: "E-Rank Initiate", minLevel: 1, bossPhase: null },
  { id: "D", name: "D-Rank Apprentice", minLevel: 6, bossPhase: 1 },
  { id: "C", name: "C-Rank Journeyman", minLevel: 14, bossPhase: 3 },
  { id: "B", name: "B-Rank Engineer", minLevel: 22, bossPhase: 5 },
  { id: "A", name: "A-Rank Architect", minLevel: 30, bossPhase: 7 },
  { id: "S", name: "S-Rank Vanguard", minLevel: 38, bossPhase: 9 },
  { id: "Ω", name: "Ascendant", minLevel: 38, bossPhase: 9 },
];

export const rankDef = (id: RankId) => RANKS.find((r) => r.id === id)!;
export const rankIndex = (id: RankId) => RANK_IDS.indexOf(id);

/** Highest rank the player qualifies for, ignoring demotion locks. Ω needs the extra retention check. */
export function qualifyingRank(level: number, bossPhasesCleared: number[], ascended: boolean): RankId {
  let best: RankId = "E";
  for (const r of RANKS) {
    if (r.id === "Ω" && !ascended) continue;
    if (level >= r.minLevel && (r.bossPhase === null || bossPhasesCleared.includes(r.bossPhase))) best = r.id;
  }
  return best;
}

export const rankFloorXP = (id: RankId) => cumulativeXP(rankDef(id).minLevel);

export interface SeverityDef {
  id: Severity;
  name: string;
  grace: number;
  decayRate: number;
  decayCap: number;
  demoteAfter: number | null;
  maxTokens: number;
  blurb: string;
}

export const SEVERITIES: Record<Severity, SeverityDef> = {
  gentle: {
    id: "gentle", name: "Gentle", grace: 2, decayRate: 0, decayCap: 0, demoteAfter: null, maxTokens: 5,
    blurb: "2 grace days. A Penalty Quest holds your new XP until you clear it. No XP decay, no demotion.",
  },
  standard: {
    id: "standard", name: "Standard", grace: 1, decayRate: 0.03, decayCap: 0.1, demoteAfter: 10, maxTokens: 3,
    blurb: "1 grace day. XP decays 3% of a level per missed day (max 10%), never below your rank floor. Demotion after 10 days at the floor.",
  },
  hardcore: {
    id: "hardcore", name: "Hardcore", grace: 0, decayRate: 0.06, decayCap: 0.2, demoteAfter: 5, maxTokens: 1,
    blurb: "No grace. Decay 6% per missed day (max 20%). Demotion after 5 days at the floor.",
  },
};

/** XP lost on a missed day that is `over` days past grace. */
export function decayAmount(sev: SeverityDef, over: number, level: number): number {
  if (over < 1 || sev.decayRate === 0) return 0;
  return Math.round(Math.min(sev.decayCap, sev.decayRate * over) * xpToNext(level));
}

export const REST_TOKEN_EVERY = 7;
export const REPAIR_WINDOW_HOURS = 48;
export const STASIS_MAX_DAYS = 30;
