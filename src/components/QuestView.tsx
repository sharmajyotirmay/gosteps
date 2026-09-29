"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STAGES } from "@/engine/course";
import { isDone } from "@/engine/game";
import { idx } from "@/lib/course";
import { useGame } from "./GameProvider";
import { TaskPanel } from "./TaskPanel";
import { InlineCode, Markdown, Panel } from "./ui";

const TYPE_LABEL: Record<string, string> = { read: "read", implement: "build", test: "test", reflect: "reflect", boss: "boss" };

export function QuestView({ id }: { id: string }) {
  const { state } = useGame();
  const quest = idx.questById.get(id);
  const boss = idx.course.phases.find((p) => p.boss.id === id);
  // The page only renders on the client (after storage loads), so reading the hash here is safe.
  const [openId] = useState(() => window.location.hash.slice(1));

  useEffect(() => {
    if (openId) document.getElementById(openId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openId]);

  if (boss) {
    const t = boss.boss;
    const doneQuests = boss.quests.filter((q) => q.tasks.every((x) => isDone(state, x.id))).length;
    return (
      <>
        <div>
          <Link href="/quests" className="small">← All quests</Link>
          <div className="eyebrow" style={{ marginTop: 10 }}>Phase {boss.index} · Gate Trial</div>
          <h1 className="page-title">{t.title}</h1>
        </div>
        <Panel title="Trial">
          <p className="small muted" style={{ marginTop: 0 }}>
            {doneQuests}/{boss.quests.length} quests in this phase completed. Gate Trials always require pasted evidence.
          </p>
          <div className="task" id={t.id}>
            <TaskPanel task={t} />
          </div>
        </Panel>
      </>
    );
  }
  if (!quest) return <p>Unknown quest.</p>;

  const phase = idx.phaseById.get(quest.phaseId)!;
  const firstOpen = quest.tasks.find((t) => !isDone(state, t.id))?.id;
  const doneCount = quest.tasks.filter((t) => isDone(state, t.id)).length;
  const qi = idx.quests.indexOf(quest);
  const prev = idx.quests[qi - 1];
  const next = idx.quests[qi + 1];

  return (
    <>
      <div>
        <Link href="/quests" className="small">← All quests</Link>
        <div className="eyebrow" style={{ marginTop: 10 }}>Phase {phase.index}: {phase.title} · Quest {quest.index}</div>
        <h1 className="page-title">{quest.title}</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>{quest.goal}</p>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 300px)" }}>
        <div className="col">
          <Panel title={`Stages · ${doneCount}/${quest.tasks.length}`}>
            <ol className="steps" aria-label="Learning Rule stages" style={{ marginBottom: 12 }}>
              {idx.course.learningRule.map((s) => {
                const ts = quest.tasks.filter((t) => t.stage === s.id);
                const cls = !ts.length ? "skip" : ts.every((t) => isDone(state, t.id)) ? "done" : ts.some((t) => t.id === firstOpen) ? "now" : "";
                return <li key={s.id} className={cls}>{s.name}</li>;
              })}
            </ol>
            <div className="stack" style={{ gap: 8 }}>
              {STAGES.map((st) => {
                const ts = quest.tasks.filter((t) => t.stage === st);
                if (!ts.length) return null;
                return (
                  <div key={st} className="stack" style={{ gap: 8 }}>
                    <div className="stage-label">{idx.course.learningRule.find((s) => s.id === st)?.name}</div>
                    {ts.map((t) => {
                      const done = isDone(state, t.id);
                      return (
                        <details key={t.id} id={t.id} className={`task ${done ? "done" : ""}`} open={openId ? openId === t.id : t.id === firstOpen}>
                          <summary>
                            <span className="box" aria-hidden="true" />
                            <span>
                              <span className="otitle">{t.title}</span>
                              <span className="osub"><span className={`type t-${t.type}`}>{TYPE_LABEL[t.type]}</span><span>~{t.minutes} min</span>{t.evidence.length > 0 && <span>evidence</span>}</span>
                            </span>
                            <span className="oxp">{done ? `+${state.progress[t.id].xp}` : ""}</span>
                          </summary>
                          <TaskPanel task={t} quest={quest} />
                        </details>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </Panel>
          <div className="row" style={{ justifyContent: "space-between" }}>
            {prev ? <Link className="btn ghost sm" href={`/quests/${prev.id}`}>← {prev.title}</Link> : <span />}
            {next ? <Link className="btn ghost sm" href={`/quests/${next.id}`}>{next.title} →</Link> : <Link className="btn sm" href={`/quests/${phase.boss.id}`}>Gate Trial →</Link>}
          </div>
        </div>

        <aside className="col">
          <Panel title="Key terms">
            <div className="terms">{quest.terms.map((t) => <span key={t} className="chip">{t}</span>)}</div>
          </Panel>
          <Panel title="Self-check">
            {quest.quiz.map((q) => (
              <details key={q.id} className="small">
                <summary style={{ cursor: "pointer" }}><InlineCode text={q.q} /></summary>
                <div style={{ marginTop: 6 }}><Markdown>{q.a}</Markdown></div>
              </details>
            ))}
            <p className="small muted" style={{ marginBottom: 0 }}>{quest.cards.length} review cards unlock when the Understand stage is done.</p>
          </Panel>
          <Panel title="Sources">
            <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              {quest.links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer">{l.title}</a></li>)}
            </ul>
          </Panel>
          {quest.confusable.length > 0 && (
            <Panel title="Don't confuse with">
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {quest.confusable.map((c) => <li key={c}><Link href={`/quests/${c}`}>{idx.questById.get(c)?.title}</Link></li>)}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
