import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DIFFICULTIES, dsaTrackSchema, problemUrl, tagUrl, type Difficulty, type DsaPhase, type DsaTrack } from "../src/engine/dsa-track";
import { parseQA } from "./parse-course";

// Builds curriculum/dsa/ into curriculum/dsa.track.json and curriculum/dsa-roadmap.md.
// Format: see curriculum/README.md ("DSA track").

const root = join(import.meta.dirname, "..", "curriculum");

interface Raw {
  title: string;
  meta: Record<string, string>;
  pattern: string[];
  problems: string[];
  cards: string[];
}

export function parseDsaPhase(src: string, phaseIndex: number, startIndex: number): DsaPhase {
  let title = "";
  const summary: string[] = [];
  const topics: Raw[] = [];
  let boss: { title: string; meta: Record<string, string>; body: string[] } | null = null;
  let cur: Raw | null = null;
  let section: "meta" | "pattern" | "problems" | "cards" | "boss" | null = null;
  let fence = false;

  for (const line of src.split("\n")) {
    if (line.startsWith("```")) fence = !fence;
    const h = !fence && /^#{1,3} /.test(line);
    if (h && line.startsWith("# ")) { title = line.slice(2).replace(/^Phase \d+:\s*/, "").trim(); continue; }
    if (h && line.startsWith("## Topic: ")) {
      cur = { title: line.slice(10).trim(), meta: {}, pattern: [], problems: [], cards: [] };
      topics.push(cur);
      section = "meta";
      continue;
    }
    if (h && line.startsWith("## Boss: ")) {
      boss = { title: line.slice(9).trim(), meta: {}, body: [] };
      cur = null;
      section = "boss";
      continue;
    }
    if (h && line.startsWith("### ")) {
      const name = line.slice(4).trim();
      if (name !== "pattern" && name !== "problems" && name !== "cards") throw new Error(`phase ${phaseIndex}: unknown section "${name}"`);
      section = name;
      continue;
    }
    if (!cur && !boss) {
      if (line.startsWith("> ")) summary.push(line.slice(2));
      continue;
    }
    const meta = line.match(/^([a-z]+):\s*(.*)$/);
    if (section === "meta" && cur && meta) { cur.meta[meta[1]] = meta[2].trim(); continue; }
    if (section === "boss" && boss) {
      if (meta && boss.body.length === 0 && ["id", "problems", "minutes"].includes(meta[1])) boss.meta[meta[1]] = meta[2].trim();
      else boss.body.push(line);
      continue;
    }
    if (cur && (section === "pattern" || section === "problems" || section === "cards")) cur[section].push(line);
  }
  if (!boss) throw new Error(`phase ${phaseIndex} has no boss`);

  const phaseId = `dp${phaseIndex}`;
  return {
    id: phaseId,
    index: phaseIndex,
    title,
    summary: summary.join(" ").trim(),
    topics: topics.map((t, i) => {
      const id = t.meta.id;
      if (!id) throw new Error(`topic "${t.title}" has no id`);
      return {
        id,
        phaseId,
        index: startIndex + i,
        title: t.title,
        days: Number(t.meta.days ?? 1),
        tags: (t.meta.tags ?? "").split(",").map((x) => x.trim()).filter(Boolean),
        pattern: t.pattern.join("\n").trim(),
        problems: t.problems
          .map((l) => l.match(/^- (easy|medium|hard) ([a-z0-9-]+) (.+)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => ({ difficulty: m[1] as Difficulty, slug: m[2], title: m[3].trim() })),
        cards: parseQA(t.cards, `${id}.c`),
      };
    }),
    boss: {
      id: boss.meta.id ?? `dboss-${phaseId}`,
      title: boss.title,
      problems: Number(boss.meta.problems ?? 4),
      minutes: Number(boss.meta.minutes ?? 60),
      body: boss.body.join("\n").trim(),
    },
  };
}

export function buildDsa(dir: string): DsaTrack {
  const meta = JSON.parse(readFileSync(join(dir, "track.json"), "utf8"));
  const files = readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f)).sort();
  let n = 1;
  const phases = files.map((f, i) => {
    const p = parseDsaPhase(readFileSync(join(dir, f), "utf8"), i + 1, n);
    n += p.topics.length;
    return p;
  });
  const track = dsaTrackSchema.parse({ ...meta, phases });

  // Cross-checks: plan length, unique ids and slugs, problem lines that failed to parse.
  const days = track.phases.reduce((a, p) => a + p.topics.reduce((b, t) => b + t.days, 0), 0);
  if (days !== track.days) throw new Error(`topic days sum to ${days}, expected ${track.days}`);
  const ids = new Set<string>();
  const slugs = new Map<string, string>();
  for (const p of track.phases) for (const t of p.topics) {
    if (ids.has(t.id)) throw new Error(`duplicate topic id ${t.id}`);
    ids.add(t.id);
    for (const pr of t.problems) {
      if (slugs.has(pr.slug)) throw new Error(`problem ${pr.slug} appears in ${slugs.get(pr.slug)} and ${t.id}`);
      slugs.set(pr.slug, t.id);
      if (!DIFFICULTIES.includes(pr.difficulty)) throw new Error(`bad difficulty for ${pr.slug}`);
    }
  }
  return track;
}

function roadmap(t: DsaTrack): string {
  const out = [
    `# ${t.title}`,
    ``,
    `> Generated from \`curriculum/dsa/\` by \`pnpm course:build\`. Edit the phase files, not this one.`,
    ``,
    t.description,
    ``,
    `Goal: **${t.goal} problems in ${t.days} days** (about ${Math.round(t.goal / t.days)} a day).`,
    ``,
  ];
  let day = 1;
  for (const p of t.phases) {
    out.push(`## Phase ${p.index}: ${p.title}`, ``, p.summary, ``);
    for (const tp of p.topics) {
      const range = tp.days > 1 ? `Days ${day}–${day + tp.days - 1}` : `Day ${day}`;
      out.push(`### ${range}: ${tp.title}`, ``);
      out.push(`Tags to fill the daily target: ${tp.tags.map((g) => `[${g}](${tagUrl(g)})`).join(", ")}`, ``);
      for (const pr of tp.problems) out.push(`- [${pr.title}](${problemUrl(pr.slug)}) · ${pr.difficulty}`);
      out.push(``);
      day += tp.days;
    }
    out.push(`**Gate Trial: ${p.boss.title}.** ${p.boss.problems} problems in ${p.boss.minutes} minutes.`, ``);
  }
  return out.join("\n");
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const dir = join(root, "dsa");
  if (existsSync(join(dir, "track.json"))) {
    const t = buildDsa(dir);
    writeFileSync(join(root, "dsa.track.json"), JSON.stringify(t, null, 2) + "\n");
    writeFileSync(join(root, "dsa-roadmap.md"), roadmap(t));
    const topics = t.phases.reduce((a, p) => a + p.topics.length, 0);
    const anchors = t.phases.reduce((a, p) => a + p.topics.reduce((b, tp) => b + tp.problems.length, 0), 0);
    const cards = t.phases.reduce((a, p) => a + p.topics.reduce((b, tp) => b + tp.cards.length, 0), 0);
    console.log(`✓ dsa: ${t.phases.length} phases, ${topics} topics, ${t.days} days, ${anchors} anchor problems, ${cards} cards`);
  }
}
