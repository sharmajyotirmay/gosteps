import type { CourseIndex } from "./course";
import type { GameState } from "./state";

// Achievements are hidden until unlocked, so they arrive as surprises rather than as
// expected, task-contingent rewards (the kind most linked to the overjustification effect).

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Optional title the player can wear. */
  title?: string;
  check: (s: GameState, idx: CourseIndex) => boolean;
}

const questDone = (s: GameState, idx: CourseIndex, questId: string) =>
  idx.questById.get(questId)?.tasks.every((t) => s.progress[t.id]) ?? false;

const solvedCount = (s: GameState) =>
  new Set(Object.values(s.problems ?? {}).filter((p) => p.outcome !== "failed").map((p) => p.slug)).size;

const bestDay = (s: GameState) => {
  const m = new Map<string, number>();
  for (const p of Object.values(s.problems ?? {})) if (p.outcome !== "failed") m.set(p.day, (m.get(p.day) ?? 0) + 1);
  return Math.max(0, ...m.values());
};

const questsDone = (s: GameState, idx: CourseIndex) => idx.quests.filter((q) => questDone(s, idx, q.id)).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-step", name: "First Step", description: "Completed your first task.", check: (s) => Object.keys(s.progress).some((k) => !k.startsWith("dsa:")) },
  { id: "first-quest", name: "Quest Cleared", description: "Finished every stage of a quest.", check: (s, i) => questsDone(s, i) >= 1 },
  { id: "first-recall", name: "Memory Trace", description: "Reviewed your first card.", check: (s) => s.player.totalReviews >= 1 },
  { id: "century", name: "Hundred Recalls", description: "100 card reviews.", title: "Keeper of Cards", check: (s) => s.player.totalReviews >= 100 },
  {
    id: "race-clean",
    name: "No Races Here",
    description: "Cleared a race-detector stage with pasted evidence.",
    check: (s) => Object.values(s.progress).some((p) => p.id.includes(".race.") && p.verify !== "honor"),
  },
  { id: "gatebreaker", name: "Gatebreaker", description: "Cleared your first Gate Trial.", title: "Gatebreaker", check: (s) => s.player.bossesCleared.length >= 1 },
  { id: "channel-wrangler", name: "Channel Wrangler", description: "Cleared the Phase 3 Gate Trial.", title: "Channel Wrangler", check: (s) => s.player.bossPhases.includes(3) },
  { id: "pool-keeper", name: "Pool Keeper", description: "Cleared the Phase 4 Gate Trial.", title: "Pool Keeper", check: (s) => s.player.bossPhases.includes(4) },
  { id: "week", name: "Seven Days", description: "Met your Daily Orders 7 days in a row.", check: (s) => s.player.bestStreak >= 7 },
  { id: "month", name: "Thirty Days", description: "Met your Daily Orders 30 days in a row.", title: "Unbroken", check: (s) => s.player.bestStreak >= 30 },
  { id: "comeback", name: "Comeback", description: "Cleared a Penalty Quest.", check: (s) => Object.values(s.penalties).some((p) => p.clearedAt) },
  { id: "deep-focus", name: "Deep Focus", description: "Completed 10 focus sessions.", check: (s) => Object.values(s.sessions).filter((x) => x.completed).length >= 10 },
  { id: "halfway", name: "Halfway There", description: "Completed 18 quests.", check: (s, i) => questsDone(s, i) >= 18 },
  { id: "shipped", name: "Shipped", description: "Cleared the final Gate Trial.", title: "Shipwright", check: (s) => s.player.bossPhases.includes(9) },
  { id: "dsa-first", name: "First Problem", description: "Logged your first DSA problem.", check: (s) => solvedCount(s) >= 1 },
  { id: "dsa-ten-day", name: "Ten in a Day", description: "Solved 10 problems in one day.", check: (s) => bestDay(s) >= 10 },
  { id: "dsa-100", name: "Centurion", description: "100 unique problems solved.", title: "Centurion", check: (s) => solvedCount(s) >= 100 },
  { id: "dsa-250", name: "Quarter Mark", description: "250 unique problems solved.", check: (s) => solvedCount(s) >= 250 },
  { id: "dsa-500", name: "Half a Thousand", description: "500 unique problems solved.", title: "Pattern Hunter", check: (s) => solvedCount(s) >= 500 },
  { id: "dsa-1000", name: "The Thousand", description: "1000 unique problems solved.", title: "Thousand-Problem Vanguard", check: (s) => solvedCount(s) >= 1000 },
  {
    id: "dsa-hard-25", name: "Hard Mode", description: "25 hard problems solved without hints.",
    check: (s) => new Set(Object.values(s.problems ?? {}).filter((p) => p.difficulty === "hard" && p.outcome === "solved").map((p) => p.slug)).size >= 25,
  },
  { id: "dsa-gate", name: "Under the Clock", description: "Cleared a DSA timed Gate Trial.", check: (s) => Object.keys(s.progress).some((k) => k.startsWith("dsa:dboss")) },
  { id: "ascendant", name: "Ascendant", description: "Reached rank Ω: course complete and long-term retention.", title: "Ascendant", check: (s) => s.player.rank === "Ω" },
];
