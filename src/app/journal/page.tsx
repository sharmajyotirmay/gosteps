"use client";

import { useState } from "react";
import { useGame } from "@/components/GameProvider";
import { Panel } from "@/components/ui";
import { today, writeReflection } from "@/engine/game";
import { idx } from "@/lib/course";

const PROMPTS = ["What did I build or learn today?", "What surprised me, or what did I get wrong at first?", "What will I do next session?"];

export default function JournalPage() {
  const { state, now, act, toast } = useGame();
  const [answers, setAnswers] = useState(["", "", ""]);
  const [query, setQuery] = useState("");
  const day = today(state, { idx, now, newId: () => "" });
  const reflectOrder = state.orders[day]?.items.find((i) => i.kind === "reflect");
  const ok = answers.every((a) => a.trim().split(/\s+/).filter(Boolean).length >= 3);

  const submit = () => {
    act((d, c) => writeReflection(d, c, answers));
    setAnswers(["", "", ""]);
    toast(reflectOrder && !reflectOrder.done ? "Reflection saved · order cleared" : "Reflection saved");
  };

  const entries = Object.values(state.reflections)
    .filter((r) => !query || r.answers.join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <div>
        <div className="eyebrow">Reflection journal</div>
        <h1 className="page-title">Journal</h1>
      </div>
      <Panel title={reflectOrder?.done ? "Another entry" : "Today's reflection"}>
        <div className="stack">
          {PROMPTS.map((p, i) => (
            <label className="field" key={p}>{p}
              <textarea id={`journal-${i}`} style={{ minHeight: 70 }} value={answers[i]} onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
            </label>
          ))}
          <div className="row">
            <button type="button" className="btn" disabled={!ok} onClick={submit}>Save reflection</button>
            {reflectOrder && !reflectOrder.done && <span className="small muted">Clears today&apos;s reflection order.</span>}
          </div>
        </div>
      </Panel>
      <Panel title={`Entries · ${entries.length}`}>
        <input type="text" id="journal-search" aria-label="Search the journal" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="stack">
          {entries.map((r) => {
            const t = r.taskId ? idx.taskById.get(r.taskId) : undefined;
            return (
              <article key={r.id} className="ach">
                <span className="row" style={{ justifyContent: "space-between" }}>
                  <span className="name">{r.kind === "feynman" ? "Explained" : r.kind === "task" ? "Quest reflection" : "Daily"}{t ? ` · ${t.title}` : ""}</span>
                  <span className="eyebrow">{r.day}</span>
                </span>
                {r.answers.map((a, i) => <p key={i} className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{a}</p>)}
              </article>
            );
          })}
          {entries.length === 0 && <p className="muted small">No entries yet.</p>}
        </div>
      </Panel>
    </>
  );
}
