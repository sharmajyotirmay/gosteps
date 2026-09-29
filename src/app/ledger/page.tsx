"use client";

import { useState } from "react";
import { useGame } from "@/components/GameProvider";
import { Panel } from "@/components/ui";
import type { LogKind } from "@/engine/state";

const KINDS: (LogKind | "all")[] = ["all", "xp", "bonus", "escrow", "release", "decay", "rank", "token", "penalty", "stasis"];

export default function LedgerPage() {
  const { state } = useGame();
  const [kind, setKind] = useState<LogKind | "all">("all");
  const [limit, setLimit] = useState(200);
  const all = Object.values(state.log).sort((a, b) => b.at.localeCompare(a.at));
  const rows = all.filter((l) => kind === "all" || l.kind === kind);
  const gained = all.filter((l) => l.delta > 0 && l.kind !== "escrow").reduce((a, l) => a + l.delta, 0);
  const lost = all.filter((l) => l.delta < 0).reduce((a, l) => a + l.delta, 0);

  return (
    <>
      <div>
        <div className="eyebrow">Every XP change, with its reason</div>
        <h1 className="page-title">Ledger</h1>
      </div>
      <Panel title="Summary">
        <div className="row">
          <span className="chip good">Gained <b>+{gained}</b></span>
          <span className="chip bad">Decayed <b>{lost}</b></span>
          <span className="chip">Held <b>{state.player.escrowXP}</b></span>
          <span className="chip">Balance <b>{state.player.xp}</b></span>
        </div>
      </Panel>
      <Panel title="Entries">
        <label className="field" style={{ maxWidth: 220, marginBottom: 12 }}>Show
          <select id="ledger-kind" value={kind} onChange={(e) => setKind(e.target.value as LogKind | "all")}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <div className="scroll">
          <table className="data">
            <thead><tr><th>When</th><th>Kind</th><th>Reason</th><th className="num">XP</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {rows.slice(0, limit).map((l) => (
                <tr key={l.id}>
                  <td className="num" style={{ textAlign: "left" }}>{new Date(l.at).toLocaleString()}</td>
                  <td>{l.kind}</td>
                  <td>{l.reason}</td>
                  <td className={`num ${l.kind === "escrow" ? "hold" : l.delta > 0 ? "plus" : l.delta < 0 ? "minus" : ""}`}>{l.delta > 0 ? `+${l.delta}` : l.delta || "–"}</td>
                  <td className="num">{l.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > limit && <button type="button" className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setLimit((n) => n + 200)}>Show more</button>}
        {rows.length === 0 && <p className="muted small">Nothing here yet.</p>}
      </Panel>
    </>
  );
}
