import type { Criterion, EvidenceKind, Phase, QA, Quest, StageId, Task, TaskType } from "../src/engine/course";
import { EVIDENCE_KINDS, STAGES } from "../src/engine/course";

// Parses the phase markdown format documented in curriculum/README.md.

const TASK_KINDS: Record<string, { type: TaskType; stage: StageId }> = {
  read: { type: "read", stage: "understand" },
  implement: { type: "implement", stage: "smallest" },
  test: { type: "test", stage: "tests" },
  concurrency: { type: "implement", stage: "concurrency" },
  race: { type: "test", stage: "race" },
  measure: { type: "implement", stage: "measure" },
  refactor: { type: "implement", stage: "refactor" },
  reflect: { type: "reflect", stage: "next" },
};

const META_KEYS = new Set([
  "id", "goal", "stats", "concurrency", "depends", "terms", "confusable",
  "minutes", "sessions", "bloom", "stage", "criteria",
]);

interface RawTask { kind: string; title: string; meta: Record<string, string>; body: string[] }
interface RawQuest {
  title: string; meta: Record<string, string>; tasks: RawTask[];
  cards: string[]; quiz: string[]; links: string[];
}

export function parseStats(s: string | undefined): Record<string, number> {
  if (!s) return {};
  const out: Record<string, number> = {};
  for (const part of s.split(",")) {
    const [k, v] = part.trim().split(/\s+/);
    if (k) out[k] = v ? Number(v) : 1;
  }
  return out;
}

export function parseCriteria(s: string): Criterion[] {
  return s.split(",").map((raw) => {
    const part = raw.trim();
    const m = part.match(/^([a-z-]+)(?:>=(\d+))?$/);
    if (!m || !EVIDENCE_KINDS.includes(m[1] as EvidenceKind)) throw new Error(`bad criterion "${part}"`);
    return m[2] ? { kind: m[1] as EvidenceKind, min: Number(m[2]) } : { kind: m[1] as EvidenceKind };
  });
}

function parseQA(lines: string[], idPrefix: string): QA[] {
  const out: QA[] = [];
  let cur: { q: string; a: string } | null = null;
  let field: "q" | "a" = "q";
  for (const line of lines) {
    if (line.startsWith("Q: ")) {
      if (cur) out.push({ id: `${idPrefix}${out.length + 1}`, ...cur });
      cur = { q: line.slice(3).trim(), a: "" };
      field = "q";
    } else if (line.startsWith("A: ") && cur) {
      cur.a = line.slice(3).trim();
      field = "a";
    } else if (cur && line.trim()) {
      cur[field] += "\n" + line;
    }
  }
  if (cur) out.push({ id: `${idPrefix}${out.length + 1}`, ...cur });
  return out;
}

function parseLinks(lines: string[]) {
  return lines
    .map((l) => l.match(/^- \[(.+)\]\((https?:\/\/[^)]+)\)\s*$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ title: m[1], url: m[2] }));
}

const list = (s: string | undefined) =>
  (s ?? "").split(",").map((x) => x.trim()).filter((x) => x && x !== "(none)");

function generatedTask(stage: StageId, q: RawQuest, concurrency: boolean): RawTask {
  const t = q.title;
  switch (stage) {
    case "race":
      return { kind: "race", title: `Race-check: ${t}`, meta: { minutes: "15" }, body: [
        `Run \`go test -race -count=3 ./...\` on the code from this quest and fix every report.`,
        ``,
        `Paste the output. It counts only when there are no \`DATA RACE\` warnings.`,
      ] };
    case "measure":
      return { kind: "measure", title: `Measure: ${t}`, meta: { minutes: "10" }, body: [
        concurrency
          ? `Run the tests with \`-count=10 -race\` and note the time. If there's a hot path, add a tiny benchmark with \`b.Loop()\` and record ns/op.`
          : `Run \`go test -cover ./...\` and record the coverage for this quest's package. Note one number you'd like to improve.`,
        ``,
        `Write the numbers in your project's \`NOTES.md\` so the Refactor stage has a baseline.`,
      ] };
    case "refactor":
      return { kind: "refactor", title: `Refactor: ${t}`, meta: { minutes: "15" }, body: [
        `With the tests green, make one improvement: a clearer name, a smaller function, a better error message, or deleting dead code.`,
        ``,
        `Re-run \`gofmt -l .\`, \`go vet ./...\`, and the tests. They must stay green.`,
      ] };
    default:
      return { kind: "reflect", title: `Reflect: ${t}`, meta: { minutes: "5" }, body: [
        `Answer in a few sentences:`,
        ``,
        `1. What did I build?`,
        `2. What surprised me, or what did I get wrong at first?`,
        `3. What will I do differently next time?`,
      ] };
  }
}

function buildTasks(raw: RawQuest, questId: string, questStats: Record<string, number>, concurrency: boolean): Task[] {
  const present = new Set(raw.tasks.map((t) => (t.meta.stage as StageId) ?? TASK_KINDS[t.kind]?.stage));
  const all: { raw: RawTask; generated: boolean }[] = raw.tasks.map((r) => ({ raw: r, generated: false }));
  const need: StageId[] = [...(concurrency ? (["race"] as StageId[]) : []), "measure", "refactor", "next"];
  for (const st of need) if (!present.has(st)) all.push({ raw: generatedTask(st, raw, concurrency), generated: true });

  const counters: Record<string, number> = {};
  const tasks = all.map(({ raw: r, generated }) => {
    const kind = TASK_KINDS[r.kind];
    if (!kind) throw new Error(`${questId}: unknown task kind "${r.kind}"`);
    const stage = (r.meta.stage as StageId) ?? kind.stage;
    if (!STAGES.includes(stage)) throw new Error(`${questId}: unknown stage "${stage}"`);
    counters[stage] = (counters[stage] ?? 0) + 1;
    const evidence: Criterion[] =
      stage === "race" ? [{ kind: "go-test-race" }] : stage === "tests" ? [{ kind: "go-test" }] : [];
    const stats = stage === "race" ? { TST: 0.5, CON: 0.5 } : kind.type === "test" ? { ...questStats, TST: Math.max(questStats.TST ?? 0, 0.5) } : questStats;
    const t: Task = {
      id: `${questId}.${stage}.${counters[stage]}`,
      questId,
      stage,
      type: kind.type,
      title: r.title,
      body: r.body.join("\n").trim(),
      stats,
      minutes: Number(r.meta.minutes ?? 15),
      evidence,
      ...(r.meta.sessions ? { sessions: Number(r.meta.sessions) } : {}),
      ...(r.meta.bloom ? { bloom: r.meta.bloom } : {}),
      ...(generated ? { generated: true } : {}),
    };
    return t;
  });
  return tasks.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));
}

/** Parse one phase file. `startIndex` is the global quest number of its first quest. */
export function parsePhase(src: string, phaseIndex: number, startIndex: number): Phase {
  const lines = src.split("\n");
  let title = "";
  const summary: string[] = [];
  const quests: RawQuest[] = [];
  let boss: RawTask | null = null;

  // cursor state
  let quest: RawQuest | null = null;
  let section: { kind: "task"; t: RawTask } | { kind: "cards" | "quiz" | "links" } | { kind: "boss"; t: RawTask } | null = null;
  let inMeta = false;
  let fence = false;

  for (const line of lines) {
    if (line.startsWith("```")) fence = !fence;
    const heading = !fence && /^#{1,3} /.test(line);

    if (heading && line.startsWith("# ")) {
      title = line.slice(2).replace(/^Phase \d+:\s*/, "").trim();
      continue;
    }
    if (heading && line.startsWith("## Quest: ")) {
      quest = { title: line.slice(10).trim(), meta: {}, tasks: [], cards: [], quiz: [], links: [] };
      quests.push(quest);
      section = null;
      inMeta = true;
      continue;
    }
    if (heading && line.startsWith("## Boss: ")) {
      boss = { kind: "boss", title: line.slice(9).trim(), meta: {}, body: [] };
      quest = null;
      section = { kind: "boss", t: boss };
      inMeta = true;
      continue;
    }
    if (heading && line.startsWith("### ")) {
      if (!quest) throw new Error(`phase ${phaseIndex}: "${line}" outside a quest`);
      const h = line.slice(4).trim();
      if (h === "cards" || h === "quiz" || h === "links") {
        section = { kind: h };
        inMeta = false;
      } else {
        const m = h.match(/^([a-z]+):\s*(.+)$/);
        if (!m) throw new Error(`bad task heading "${line}"`);
        const t: RawTask = { kind: m[1], title: m[2], meta: {}, body: [] };
        quest.tasks.push(t);
        section = { kind: "task", t };
        inMeta = true;
      }
      continue;
    }

    if (!quest && !section) {
      if (line.startsWith("> ")) summary.push(line.slice(2));
      continue;
    }

    const metaMatch = line.match(/^([a-z]+):\s*(.*)$/);
    if (inMeta && !fence && metaMatch && META_KEYS.has(metaMatch[1])) {
      const target = section && (section.kind === "task" || section.kind === "boss") ? section.t.meta : quest!.meta;
      target[metaMatch[1]] = metaMatch[2].trim();
      continue;
    }
    if (inMeta && line.trim() === "" && !section) continue; // blank lines after quest meta
    inMeta = false;

    if (!section) continue;
    if (section.kind === "task" || section.kind === "boss") section.t.body.push(line);
    else if (quest) quest[section.kind].push(line);
  }

  if (!boss) throw new Error(`phase ${phaseIndex} has no boss`);
  const phaseId = `p${phaseIndex}`;
  const builtQuests: Quest[] = quests.map((q, i) => {
    const id = q.meta.id;
    if (!id) throw new Error(`quest "${q.title}" has no id`);
    const stats = parseStats(q.meta.stats);
    const concurrency = q.meta.concurrency === "true";
    return {
      id,
      phaseId,
      index: startIndex + i,
      title: q.title,
      goal: q.meta.goal ?? "",
      stats,
      concurrency,
      depends: list(q.meta.depends),
      terms: list(q.meta.terms),
      confusable: list(q.meta.confusable),
      tasks: buildTasks(q, id, stats, concurrency),
      cards: parseQA(q.cards, `${id}.c`),
      quiz: parseQA(q.quiz, `${id}.q`),
      links: parseLinks(q.links),
    };
  });

  const bossId = boss.meta.id ?? `boss-${phaseId}`;
  return {
    id: phaseId,
    index: phaseIndex,
    title,
    summary: summary.join(" ").trim(),
    quests: builtQuests,
    boss: {
      id: bossId,
      questId: bossId,
      stage: "next",
      type: "boss",
      title: boss.title,
      body: boss.body.join("\n").trim(),
      stats: parseStats(boss.meta.stats),
      minutes: 60,
      evidence: parseCriteria(boss.meta.criteria ?? "go-test"),
    },
  };
}
