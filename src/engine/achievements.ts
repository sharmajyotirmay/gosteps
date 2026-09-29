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

const questsDone = (s: GameState, idx: CourseIndex) => idx.quests.filter((q) => questDone(s, idx, q.id)).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-step", name: "First Step", description: "Completed your first task.", check: (s) => Object.keys(s.progress).length >= 1 },
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
  { id: "ascendant", name: "Ascendant", description: "Reached rank Ω: course complete and long-term retention.", title: "Ascendant", check: (s) => s.player.rank === "Ω" },
];
