"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Grade } from "ts-fsrs";
import { useGame } from "@/components/GameProvider";
import { Markdown, Panel } from "@/components/ui";
import { dueCards, drillCards, finishTrial, previewIntervals, reviewCard, today, trialCards } from "@/engine/game";
import { dayEnd } from "@/engine/day";
import { has } from "@/engine/methods";
import type { CardRec } from "@/engine/state";
import { idx } from "@/lib/course";

const LABELS: Record<1 | 2 | 3 | 4, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

function span(from: Date, to: Date) {
  const m = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d}d` : `${Math.round(d / 30)}mo`;
}

export default function ReviewPage() {
  const { state, now, act } = useGame();
  const [mode, setMode] = useState<"normal" | "trial">("normal");
  // The queue is fixed when a session starts so cards don't jump around mid-session.
  const [queue, setQueue] = useState<string[]>(() => {
    const ctx = { idx, now: new Date(), newId: () => "" };
    const due = dueCards(state, dayEnd(today(state, ctx), state.settings.dayBoundaryHour));
    const order = state.orders[today(state, ctx)]?.items.find((i) => i.kind === "review");
    const drill = has(state.settings.methods, "interleave") && order?.drill ? drillCards(state, ctx, new Set(due.map((c) => c.id)), order.drill) : [];
    return [...due, ...drill].map((c) => c.id);
  });
  const [pos, setPos] = useState(0);
  const [shown, setShown] = useState(false);
  const [ratings, setRatings] = useState<Grade[]>([]);

  const card: CardRec | undefined = state.cards[queue[pos]];
  const finished = pos >= queue.length;

  const rate = (r: Grade) => {
    if (!card) return;
    act((d, c) => reviewCard(d, c, card.id, r, { trial: mode === "trial" }));
    const nextRatings = [...ratings, r];
    setRatings(nextRatings);
    if (r === 1 && mode === "normal") setQueue((q) => [...q, card.id]);
    setShown(false);
    setPos((p) => p + 1);
    if (mode === "trial" && pos + 1 >= queue.length) act((d, c) => { finishTrial(d, c, nextRatings); });
  };

  const startTrial = () => {
    setMode("trial");
    setQueue(trialCards(state).map((c) => c.id));
    setPos(0);
    setRatings([]);
    setShown(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (!card) return;
      if (e.key === " " && !shown) { e.preventDefault(); setShown(true); }
      else if (shown && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as Grade);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const upcoming = Object.values(state.cards).map((c) => c.fsrs.due).sort()[0];
  const intervals = card ? previewIntervals(card, now) : null;
  const quest = card ? idx.questById.get(card.questId) : undefined;

  return (
    <>
      <div>
        <div className="eyebrow">{mode === "trial" ? "Re-Ascension Trial" : "Spaced repetition · FSRS"}</div>
        <h1 className="page-title">Review</h1>
      </div>
      {state.player.rankLock && mode === "normal" && (
        <section className="panel notice penalty">
          <span className="tag">TRIAL</span>
          <div>
            <p>Your rank {state.player.rankLock} is locked. Recall 80% of your 12 weakest cards (rate Good or Easy) to restore it.</p>
            <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={startTrial} disabled={trialCards(state).length < 10}>Start the Trial</button>
          </div>
        </section>
      )}
      {!has(state.settings.methods, "srs") && <p className="muted">Spaced repetition is off. Turn it on in Settings to generate review cards.</p>}

      {!finished && card ? (
        <Panel title={`Card ${pos + 1} of ${queue.length}`}>
          <div className="flash">
            <div className="eyebrow">{quest ? `Quest ${quest.index} · ${quest.title}` : ""}</div>
            <div className="front"><Markdown>{card.front}</Markdown></div>
            {shown ? (
              <>
                <div style={{ borderTop: "1px solid var(--panel-edge)", paddingTop: 14 }}><Markdown>{card.back}</Markdown></div>
                <div className="ratings" role="group" aria-label="How well did you recall it?">
                  {([1, 2, 3, 4] as const).map((r) => (
                    <button key={r} type="button" className={`btn ${r === 1 ? "danger" : r === 3 ? "" : "ghost"}`} onClick={() => rate(r)}>
                      {LABELS[r]} <small>{r} · {intervals ? span(now, intervals[r]) : ""}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div><button type="button" className="btn" onClick={() => setShown(true)}>Show answer <small>(Space)</small></button></div>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title="Session">
          <p style={{ marginTop: 0 }}>
            {queue.length === 0 ? "Nothing is due right now." : `Session complete: ${ratings.length} reviews, ${ratings.filter((r) => r >= 3).length} recalled well.`}
          </p>
          <p className="small muted">
            {Object.keys(state.cards).length} cards in your deck.
            {upcoming && ` Next due ${new Date(upcoming).toLocaleString()}.`} New cards arrive when you finish a quest&apos;s Understand stage.
          </p>
          <Link className="btn ghost" href="/">Back to Status</Link>
        </Panel>
      )}
    </>
  );
}
