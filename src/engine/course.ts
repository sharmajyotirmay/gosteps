import { z } from "zod";

// Curriculum is data: every course is one JSON file validated by this schema.

export const STAGES = [
  "understand",
  "smallest",
  "tests",
  "concurrency",
  "race",
  "measure",
  "refactor",
  "next",
] as const;
export type StageId = (typeof STAGES)[number];

export const TASK_TYPES = ["read", "implement", "test", "reflect", "review", "boss"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const EVIDENCE_KINDS = [
  "go-test",
  "go-test-race",
  "goleak",
  "coverage",
  "go-bench",
  "github-commit",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

const criterion = z.object({ kind: z.enum(EVIDENCE_KINDS), min: z.number().optional() });
export type Criterion = z.infer<typeof criterion>;

const statWeights = z.record(z.string(), z.number().min(0).max(1));

const task = z.object({
  id: z.string(),
  questId: z.string(),
  stage: z.enum(STAGES),
  type: z.enum(TASK_TYPES),
  title: z.string(),
  body: z.string(),
  stats: statWeights,
  minutes: z.number().int().positive(),
  sessions: z.number().int().positive().optional(),
  bloom: z.string().optional(),
  evidence: z.array(criterion),
  generated: z.boolean().optional(),
});
export type Task = z.infer<typeof task>;

const qa = z.object({ id: z.string(), q: z.string(), a: z.string() });
export type QA = z.infer<typeof qa>;

const link = z.object({ title: z.string(), url: z.string().url() });

const quest = z.object({
  id: z.string(),
  phaseId: z.string(),
  index: z.number().int().positive(),
  title: z.string(),
  goal: z.string(),
  stats: statWeights,
  concurrency: z.boolean(),
  depends: z.array(z.string()),
  terms: z.array(z.string()),
  confusable: z.array(z.string()),
  tasks: z.array(task).min(1),
  cards: z.array(qa),
  quiz: z.array(qa),
  links: z.array(link),
});
export type Quest = z.infer<typeof quest>;

const phase = z.object({
  id: z.string(),
  index: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  quests: z.array(quest).min(1),
  boss: task.extend({ type: z.literal("boss") }),
});
export type Phase = z.infer<typeof phase>;

export const courseSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  title: z.string(),
  language: z.string(),
  project: z.string(),
  description: z.string(),
  stats: z.array(z.object({ id: z.string(), name: z.string(), blurb: z.string() })).min(1),
  learningRule: z.array(z.object({ id: z.enum(STAGES), name: z.string() })),
  phases: z.array(phase).min(1),
});
export type Course = z.infer<typeof courseSchema>;

/** Flattened lookups built once per course. */
export interface CourseIndex {
  course: Course;
  quests: Quest[];
  questById: Map<string, Quest>;
  taskById: Map<string, Task>;
  phaseById: Map<string, Phase>;
  /** Every task in course order: quest tasks, then each phase's boss after its last quest. */
  orderedTasks: Task[];
  phaseIndexOfTask: Map<string, number>;
}

export function indexCourse(course: Course): CourseIndex {
  const quests: Quest[] = [];
  const questById = new Map<string, Quest>();
  const taskById = new Map<string, Task>();
  const phaseById = new Map<string, Phase>();
  const orderedTasks: Task[] = [];
  const phaseIndexOfTask = new Map<string, number>();
  for (const p of course.phases) {
    phaseById.set(p.id, p);
    for (const q of p.quests) {
      quests.push(q);
      questById.set(q.id, q);
      for (const t of q.tasks) {
        taskById.set(t.id, t);
        orderedTasks.push(t);
        phaseIndexOfTask.set(t.id, p.index);
      }
    }
    taskById.set(p.boss.id, p.boss);
    orderedTasks.push(p.boss);
    phaseIndexOfTask.set(p.boss.id, p.index);
  }
  return { course, quests, questById, taskById, phaseById, orderedTasks, phaseIndexOfTask };
}
