"use client";

import Link from "next/link";
import { useGame } from "@/components/GameProvider";
import { Panel } from "@/components/ui";
import { isDone, nextTask } from "@/engine/game";
import { course, idx } from "@/lib/course";

export default function QuestsPage() {
  const { state } = useGame();
  const next = nextTask(state, idx);

  return (
    <>
      <div>
        <div className="eyebrow">{course.project} · {course.phases.length} phases</div>
        <h1 className="page-title">{course.title}</h1>
        <p className="muted" style={{ margin: "6px 0 0", maxWidth: "70ch" }}>{course.description}</p>
      </div>
      {course.phases.map((p) => {
        const bossDone = isDone(state, p.boss.id);
        return (
          <Panel key={p.id} title={`Phase ${p.index} · ${p.title}`}>
            <p className="small muted" style={{ marginTop: 0 }}>{p.summary}</p>
            <div className="grid-cols">
              {p.quests.map((q) => {
                const done = q.tasks.filter((t) => isDone(state, t.id)).length;
                const complete = done === q.tasks.length;
                const current = next?.questId === q.id;
                return (
                  <Link key={q.id} href={`/quests/${q.id}`} className="panel qcard" style={current ? { borderColor: "var(--accent)" } : undefined}>
                    <span className="row" style={{ justifyContent: "space-between" }}>
                      <span className="eyebrow">Quest {q.index}</span>
                      {complete ? <span className="chip good">Cleared</span> : current ? <span className="chip">Current</span> : null}
                    </span>
                    <h3>{q.title}</h3>
                    <span className="small muted">{q.goal}</span>
                    <span className="progress" aria-label={`${done} of ${q.tasks.length} tasks`}><i style={{ width: `${(done / q.tasks.length) * 100}%` }} /></span>
                  </Link>
                );
              })}
              <Link href={`/quests/${p.boss.id}`} className="panel qcard" style={{ borderColor: bossDone ? "var(--good)" : "color-mix(in srgb, var(--danger) 55%, transparent)" }}>
                <span className="row" style={{ justifyContent: "space-between" }}>
                  <span className="eyebrow">Gate Trial</span>
                  {bossDone ? <span className="chip good">Cleared</span> : <span className="chip bad">Boss</span>}
                </span>
                <h3>{p.boss.title}</h3>
                <span className="small muted">Pass: {p.boss.evidence.map((e) => e.kind + (e.min ? ` ≥ ${e.min}%` : "")).join(", ")}</span>
              </Link>
            </div>
          </Panel>
        );
      })}
    </>
  );
}
