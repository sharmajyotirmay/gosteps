"use client";

import { useGame } from "@/components/GameProvider";
import { Panel, PlayerCard, sharpness, statValue } from "@/components/ui";
import { ACHIEVEMENTS } from "@/engine/achievements";
import { setTitle } from "@/engine/game";
import { levelFromXP, RANKS, rankIndex } from "@/engine/rules";
import { stats } from "@/lib/course";

export default function ProfilePage() {
  const { state, now, act } = useGame();
  const titles = ACHIEVEMENTS.filter((a) => a.title && state.achievements[a.id]).map((a) => a.title!);
  const level = levelFromXP(state.player.xp);
  const unlocked = ACHIEVEMENTS.filter((a) => state.achievements[a.id]).length;

  return (
    <>
      <div>
        <div className="eyebrow">Player profile</div>
        <h1 className="page-title">{state.player.name}</h1>
      </div>
      <div className="grid-2">
        <div className="col">
          <Panel title="Status">
            <PlayerCard state={state} />
            <label className="field" style={{ marginTop: 14 }}>Title
              <select id="title" value={state.player.title ?? ""} onChange={(e) => act((d) => setTitle(d, e.target.value || null))}>
                <option value="">(none)</option>
                {titles.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </Panel>
          <Panel title="Rank ladder">
            <div className="stack" style={{ gap: 8 }}>
              {RANKS.map((r) => {
                const cur = r.id === state.player.rank;
                const reached = rankIndex(state.player.rank) >= rankIndex(r.id);
                return (
                  <div key={r.id} className="row" style={{ opacity: reached || cur ? 1 : 0.6, flexWrap: "nowrap" }}>
                    <span className="rank sm" style={cur ? undefined : { borderColor: "var(--panel-edge)", color: reached ? "var(--accent)" : "var(--muted)" }}>{r.id}</span>
                    <span className="small" style={{ minWidth: 0 }}>
                      <b>{r.name}</b><br />
                      <span className="muted">LV {r.minLevel}{r.bossPhase ? ` + Phase ${r.bossPhase} Gate` : ""}{r.id === "Ω" ? " + 90% of cards stable ≥ 30 days" : ""}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
        <div className="col">
          <Panel title="Stats">
            <div className="scroll">
              <table className="data">
                <thead><tr><th>Stat</th><th>Covers</th><th className="num">Value</th><th className="num">Sharpness</th></tr></thead>
                <tbody>
                  {stats.map((s) => {
                    const sh = sharpness(state, s.id, now);
                    return (
                      <tr key={s.id}>
                        <td><b>{s.id}</b> {s.name}</td>
                        <td className="muted">{s.blurb}</td>
                        <td className="num">{statValue(state.player.statXP[s.id] ?? 0)}</td>
                        <td className="num">{sh === null ? "–" : `${sh}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>Value = √(stat XP). Level {level}, {Object.keys(state.progress).filter((k) => !k.startsWith("dsa:")).length} quest tasks done, {new Set(Object.values(state.problems).filter((p) => p.outcome !== "failed").map((p) => p.slug)).size} DSA problems solved, {state.player.totalReviews} reviews, best streak {state.player.bestStreak} days.</p>
          </Panel>
          <Panel title={`Achievements · ${unlocked}/${ACHIEVEMENTS.length}`}>
            <div className="grid-cols" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {ACHIEVEMENTS.map((a) => {
                const got = state.achievements[a.id];
                return (
                  <div key={a.id} className={`ach ${got ? "" : "locked"}`}>
                    <span className="name">{got ? a.name : "???"}</span>
                    <span className="small muted">{got ? a.description : "Hidden until unlocked."}</span>
                    {got && a.title && <span className="small" style={{ color: "var(--gold)" }}>Title: {a.title}</span>}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
