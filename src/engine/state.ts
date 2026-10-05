import type { DayKey } from "./day";
import type { MethodId } from "./methods";
import { BALANCED_PRESET } from "./methods";
import type { RankId, Severity, Verify } from "./rules";

// Player state. Every collection is a Record keyed by id so the storage layer can persist
// only what changed (immutable updates keep unchanged records referentially equal).

export interface Player {
  id: "player";
  name: string;
  courseId: string;
  createdAt: string;
  onboarded: boolean;
  xp: number;
  escrowXP: number;
  rank: RankId;
  /** After a demotion, auto-promotion to this rank (or above) waits for the Re-Ascension Trial. */
  rankLock: RankId | null;
  bossesCleared: string[];
  bossPhases: number[];
  statXP: Record<string, number>;
  title: string | null;
  restTokens: number;
  metSinceToken: number;
  lastProcessedDay: DayKey | null;
  missedStreak: number;
  metStreak: number;
  bestStreak: number;
  daysAtFloor: number;
  stasis: { since: string; until: string } | null;
  stasisCooldownUntil: string | null;
  totalReviews: number;
}

export type Theme = "system" | "dark" | "light";

export interface Settings {
  id: "settings";
  severity: Severity;
  methods: MethodId[];
  dayBoundaryHour: number;
  pomodoroWork: number;
  pomodoroBreak: number;
  reviewCap: number;
  verification: Verify;
  autoUseTokens: boolean;
  quietMode: boolean;
  sound: boolean;
  theme: Theme;
  intention: string;
  dsa: DsaSettings;
}

export interface DsaSettings {
  enabled: boolean;
  /** Plan day 1. Null until the challenge is started. */
  start: DayKey | null;
  goal: number;
  days: number;
}

export type ProblemOutcome = "solved" | "hint" | "failed";

/** One logged DSA attempt. Unique solved slugs count toward the goal. */
export interface SolvedProblem {
  id: string;
  slug: string;
  title: string;
  url: string;
  difficulty: "easy" | "medium" | "hard";
  topicId: string;
  outcome: ProblemOutcome;
  inGo: boolean;
  minutes: number | null;
  at: string;
  day: DayKey;
  xp: number;
  /** Set for hint/failed attempts: when to re-solve without help. */
  redoAt: string | null;
  redoneAt: string | null;
}

export interface Progress {
  id: string; // task id
  questId: string;
  completedAt: string;
  day: DayKey;
  verify: Verify;
  xp: number;
  sessions: number;
}

/** FSRS card with dates as ISO strings so it survives JSON export. */
export interface SerializedFsrs {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface CardRec {
  id: string;
  questId: string;
  phaseIndex: number;
  statId: string;
  front: string;
  back: string;
  fsrs: SerializedFsrs;
  createdAt: string;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  at: string;
  day: DayKey;
  rating: 1 | 2 | 3 | 4;
}

export type OrderKind = "review" | "concept" | "build" | "reflect" | "dsa";

export interface OrderItem {
  id: string;
  kind: OrderKind;
  title: string;
  taskId?: string;
  target: number;
  progress: number;
  done: boolean;
  optional: boolean;
  xp: number;
  drill: number;
}

export interface DailyOrders {
  id: DayKey;
  items: OrderItem[];
  bonusGranted: boolean;
  met: boolean | null;
  tokenUsed: boolean;
  repaired: boolean;
}

export interface Penalty {
  id: string;
  issuedAt: string;
  deadline: string;
  forDays: DayKey[];
  reviewTarget: number;
  reviewProgress: number;
  taskId: string | null;
  taskDone: boolean;
  needsReflection: boolean;
  reflectionDone: boolean;
  clearedAt: string | null;
  repaired: boolean;
}

export type LogKind = "xp" | "escrow" | "release" | "decay" | "bonus" | "rank" | "token" | "penalty" | "achievement" | "stasis";

export interface LogEntry {
  id: string;
  at: string;
  day: DayKey;
  kind: LogKind;
  delta: number;
  balance: number;
  reason: string;
  ref?: string;
}

export type NoticeKind = "orders" | "levelup" | "rank" | "penalty" | "cleared" | "achievement" | "boss" | "quest" | "decay" | "info";

export interface Notice {
  id: string;
  at: string;
  kind: NoticeKind;
  title: string;
  body: string;
  read: boolean;
  important: boolean;
}

export interface Reflection {
  id: string;
  at: string;
  day: DayKey;
  kind: "daily" | "task" | "feynman";
  taskId?: string;
  answers: string[];
}

export interface FocusSession {
  id: string;
  taskId: string;
  start: string;
  end: string;
  completed: boolean;
}

export interface Attempt {
  id: string;
  taskId: string;
  at: string;
  kind: "recall" | "evidence";
  payload: Record<string, unknown>;
  passed: boolean;
}

export interface AchievementRec {
  id: string;
  at: string;
}

export interface GameState {
  player: Player;
  settings: Settings;
  progress: Record<string, Progress>;
  cards: Record<string, CardRec>;
  reviews: Record<string, ReviewLog>;
  orders: Record<string, DailyOrders>;
  penalties: Record<string, Penalty>;
  log: Record<string, LogEntry>;
  notices: Record<string, Notice>;
  reflections: Record<string, Reflection>;
  sessions: Record<string, FocusSession>;
  attempts: Record<string, Attempt>;
  achievements: Record<string, AchievementRec>;
  problems: Record<string, SolvedProblem>;
}

export const COLLECTIONS = [
  "progress",
  "cards",
  "reviews",
  "orders",
  "penalties",
  "log",
  "notices",
  "reflections",
  "sessions",
  "attempts",
  "achievements",
  "problems",
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export function initialState(courseId: string, now: Date): GameState {
  return {
    player: {
      id: "player",
      name: "",
      courseId,
      createdAt: now.toISOString(),
      onboarded: false,
      xp: 0,
      escrowXP: 0,
      rank: "E",
      rankLock: null,
      bossesCleared: [],
      bossPhases: [],
      statXP: {},
      title: null,
      restTokens: 1,
      metSinceToken: 0,
      lastProcessedDay: null,
      missedStreak: 0,
      metStreak: 0,
      bestStreak: 0,
      daysAtFloor: 0,
      stasis: null,
      stasisCooldownUntil: null,
      totalReviews: 0,
    },
    settings: {
      id: "settings",
      severity: "standard",
      methods: [...BALANCED_PRESET],
      dayBoundaryHour: 4,
      pomodoroWork: 25,
      pomodoroBreak: 5,
      reviewCap: 15,
      verification: "honor",
      autoUseTokens: true,
      quietMode: false,
      sound: true,
      theme: "dark",
      intention: "",
      dsa: { ...DEFAULT_DSA },
    },
    progress: {},
    cards: {},
    reviews: {},
    orders: {},
    penalties: {},
    log: {},
    notices: {},
    reflections: {},
    sessions: {},
    attempts: {},
    achievements: {},
    problems: {},
  };
}

export const DEFAULT_DSA: DsaSettings = { enabled: true, start: null, goal: 1000, days: 100 };

/** Fill fields added after a save was written (older IndexedDB data or backups). */
export function normalizeState(s: GameState): GameState {
  const settings = s.settings.dsa ? s.settings : { ...s.settings, dsa: { ...DEFAULT_DSA } };
  const missing = COLLECTIONS.filter((c) => !s[c]);
  if (settings === s.settings && missing.length === 0) return s;
  const next = { ...s, settings } as GameState;
  for (const c of missing) (next as unknown as Record<string, unknown>)[c] = {};
  return next;
}
