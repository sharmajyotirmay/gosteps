import { z } from "zod";

// The DSA track: phases → topics (a few days each) → problems. Data, like the Go course.

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const problem = z.object({ slug: z.string(), title: z.string(), difficulty: z.enum(DIFFICULTIES) });
export type AnchorProblem = z.infer<typeof problem>;

const topic = z.object({
  id: z.string(),
  phaseId: z.string(),
  index: z.number().int().positive(),
  title: z.string(),
  days: z.number().int().positive(),
  tags: z.array(z.string()).min(1),
  pattern: z.string(),
  problems: z.array(problem).min(1),
  cards: z.array(z.object({ id: z.string(), q: z.string(), a: z.string() })).min(1),
});
export type DsaTopic = z.infer<typeof topic>;

const boss = z.object({
  id: z.string(),
  title: z.string(),
  problems: z.number().int().positive(),
  minutes: z.number().int().positive(),
  body: z.string(),
});
export type DsaBoss = z.infer<typeof boss>;

const phase = z.object({
  id: z.string(),
  index: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  topics: z.array(topic).min(1),
  boss,
});
export type DsaPhase = z.infer<typeof phase>;

export const dsaTrackSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  title: z.string(),
  goal: z.number().int().positive(),
  days: z.number().int().positive(),
  language: z.string(),
  description: z.string(),
  stats: z.array(z.object({ id: z.string(), name: z.string(), blurb: z.string() })),
  phases: z.array(phase).min(1),
});
export type DsaTrack = z.infer<typeof dsaTrackSchema>;

export interface DsaIndex {
  track: DsaTrack;
  topics: DsaTopic[];
  topicById: Map<string, DsaTopic>;
  phaseOfTopic: Map<string, DsaPhase>;
  /** topic id for each plan day (index 0 = day 1). */
  dayPlan: string[];
  /** first plan day (1-based) of each topic. */
  topicStartDay: Map<string, number>;
  anchorBySlug: Map<string, { topicId: string; problem: AnchorProblem }>;
}

export function indexDsa(track: DsaTrack): DsaIndex {
  const topics: DsaTopic[] = [];
  const topicById = new Map<string, DsaTopic>();
  const phaseOfTopic = new Map<string, DsaPhase>();
  const dayPlan: string[] = [];
  const topicStartDay = new Map<string, number>();
  const anchorBySlug = new Map<string, { topicId: string; problem: AnchorProblem }>();
  for (const p of track.phases) {
    for (const t of p.topics) {
      topics.push(t);
      topicById.set(t.id, t);
      phaseOfTopic.set(t.id, p);
      topicStartDay.set(t.id, dayPlan.length + 1);
      for (let i = 0; i < t.days; i++) dayPlan.push(t.id);
      for (const pr of t.problems) anchorBySlug.set(pr.slug, { topicId: t.id, problem: pr });
    }
  }
  return { track, topics, topicById, phaseOfTopic, dayPlan, topicStartDay, anchorBySlug };
}

export const problemUrl = (slug: string) => `https://leetcode.com/problems/${slug}/`;
export const tagUrl = (tag: string) => `https://leetcode.com/tag/${tag}/`;

/** Accepts a LeetCode URL, a slug, or a title and returns a stable slug-like key. */
export function toSlug(input: string): string {
  const s = input.trim();
  const m = s.match(/leetcode\.(?:com|cn)\/problems\/([a-z0-9-]+)/i);
  if (m) return m[1].toLowerCase();
  return s
    .toLowerCase()
    .replace(/^\d+\.\s*/, "") // "1. Two Sum" → "two sum"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
