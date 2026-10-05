"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { retrievability } from "@/engine/game";
import { levelProgress, rankDef } from "@/engine/rules";
import type { GameState } from "@/engine/state";
import { stats } from "@/lib/course";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ href, children: c }) => <a href={href} target="_blank" rel="noreferrer">{c}</a> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Inline text with `code` spans, for single-line prompts where block markdown would add paragraphs. */
export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title && <h2 className="ptitle">{title}</h2>}
      {children}
    </section>
  );
}

export function XPBar({ state }: { state: GameState }) {
  const { level, into, need } = levelProgress(state.player.xp);
  const pct = Math.min(100, (into / need) * 100);
  const esc = Math.min(100 - pct, (state.player.escrowXP / need) * 100);
  return (
    <div className="xp">
      <div className="xpbar" role="progressbar" aria-label={`Level ${level} progress`} aria-valuemin={0} aria-valuemax={need} aria-valuenow={into}>
        <div className="fill" style={{ width: `${pct}%` }} />
        {esc > 0 && <div className="esc" style={{ left: `${pct}%`, width: `${esc}%` }} />}
      </div>
      <div className="xprow">
        <span><b>{into}</b> / {need} XP</span>
        {state.player.escrowXP > 0 && <span className="hold">+<b>{state.player.escrowXP}</b> held</span>}
        <span>Total {state.player.xp.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function PlayerCard({ state }: { state: GameState }) {
  const { level } = levelProgress(state.player.xp);
  const r = rankDef(state.player.rank);
  return (
    <div className="player">
      <div className="rank" aria-label={`Rank ${r.id}`}>{r.id}</div>
      <div>
        <div className="pname">{state.player.name}</div>
        <div className="ptitle-sm">{state.player.title ? `Title: ${state.player.title}` : r.name}</div>
        <div className="lvl">LV <b>{level}</b></div>
      </div>
      <XPBar state={state} />
    </div>
  );
}

export function statValue(xp: number) {
  return Math.floor(Math.sqrt(xp));
}

export function sharpness(state: GameState, statId: string, now: Date): number | null {
  const cards = Object.values(state.cards).filter((c) => c.statId === statId && c.fsrs.reps > 0);
  if (!cards.length) return null;
  return Math.round((cards.reduce((a, c) => a + retrievability(c, now), 0) / cards.length) * 100);
}

export function StatList({ state, now }: { state: GameState; now: Date }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {stats.map((s) => {
        const sh = sharpness(state, s.id, now);
        const c = sh === null ? "var(--muted)" : sh < 75 ? "var(--warn)" : "var(--good)";
        return (
          <div className="stat" key={s.id} title={s.blurb}>
            <span className="k">{s.id}</span>
            <span className="nm">{s.name}</span>
            <span className="n">{statValue(state.player.statXP[s.id] ?? 0)}</span>
            <span className="sharp">
              <span className="meter"><i style={{ width: `${sh ?? 0}%`, ["--c" as string]: c }} /></span>
              {sh === null ? "no cards" : `${sh}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Tokens({ n, max }: { n: number; max: number }) {
  return (
    <span className="tokens" aria-label={`${n} of ${max} rest tokens`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={`tok ${i < n ? "on" : ""}`} />)}
    </span>
  );
}
