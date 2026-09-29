import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { courseSchema, STAGES, type Course } from "../src/engine/course";
import { parsePhase } from "./parse-course";

// Builds every course folder in curriculum/ into curriculum/<id>.course.json
// and a human-readable curriculum/<id>-roadmap.md.

const root = join(import.meta.dirname, "..", "curriculum");

export function buildCourse(dir: string): Course {
  const meta = JSON.parse(readFileSync(join(dir, "course.json"), "utf8"));
  const files = readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f)).sort();
  let questIndex = 1;
  const phases = files.map((f, i) => {
    const p = parsePhase(readFileSync(join(dir, f), "utf8"), i + 1, questIndex);
    questIndex += p.quests.length;
    return p;
  });
  const course = courseSchema.parse({ ...meta, phases });

  // Cross-reference checks the schema can't express.
  const questIds = new Set<string>();
  const statIds = new Set(course.stats.map((s) => s.id));
  for (const p of course.phases) for (const q of p.quests) {
    if (questIds.has(q.id)) throw new Error(`duplicate quest id ${q.id}`);
    questIds.add(q.id);
  }
  for (const p of course.phases) {
    for (const q of p.quests) {
      for (const d of [...q.depends, ...q.confusable]) {
        if (!questIds.has(d)) throw new Error(`${q.id} references unknown quest ${d}`);
      }
      for (const t of q.tasks) for (const s of Object.keys(t.stats)) {
        if (!statIds.has(s)) throw new Error(`${t.id} uses unknown stat ${s}`);
      }
      if (q.cards.length === 0) throw new Error(`${q.id} has no cards`);
    }
  }
  return course;
}

function roadmapMarkdown(c: Course): string {
  const out = [
    `# ${c.title}`,
    ``,
    `> Generated from \`curriculum/${c.id}/\` by \`pnpm course:build\`. Edit the phase files, not this one.`,
    ``,
    c.description,
    ``,
    `**Learning Rule** (every quest): ${c.learningRule.map((s) => s.name).join(" → ")}`,
    ``,
  ];
  for (const p of c.phases) {
    out.push(`## Phase ${p.index}: ${p.title}`, ``, p.summary, ``);
    for (const q of p.quests) {
      const stages = [...new Set(q.tasks.map((t) => t.stage))].sort((a, b) => STAGES.indexOf(a) - STAGES.indexOf(b));
      out.push(`${q.index}. **${q.title}**: ${q.goal} _(${q.tasks.length} tasks · ${q.cards.length} cards · stages: ${stages.length})_`);
    }
    out.push(``, `**Boss: ${p.boss.title}**. Pass criteria: ${p.boss.evidence.map((e) => e.kind + (e.min ? ` ≥ ${e.min}%` : "")).join(", ")}`, ``);
  }
  return out.join("\n");
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(join(root, entry.name, "course.json"))) continue;
    const course = buildCourse(join(root, entry.name));
    writeFileSync(join(root, `${course.id}.course.json`), JSON.stringify(course, null, 2) + "\n");
    writeFileSync(join(root, `${course.id}-roadmap.md`), roadmapMarkdown(course));
    const quests = course.phases.reduce((n, p) => n + p.quests.length, 0);
    const tasks = course.phases.reduce((n, p) => n + p.quests.reduce((m, q) => m + q.tasks.length, 0) + 1, 0);
    const cards = course.phases.reduce((n, p) => n + p.quests.reduce((m, q) => m + q.cards.length, 0), 0);
    console.log(`✓ ${course.id}: ${course.phases.length} phases, ${quests} quests, ${tasks} tasks, ${cards} cards`);
  }
}
