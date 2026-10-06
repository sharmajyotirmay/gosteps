"use client";

import { useState } from "react";
import type { DiskState } from "@/components/GameProvider";
import { useGame } from "@/components/GameProvider";
import { Panel } from "@/components/ui";
import { endStasis, spendRestToken, startStasis, updateSettings } from "@/engine/game";
import { METHOD_IDS, METHODS, type MethodId } from "@/engine/methods";
import { SEVERITIES, STASIS_MAX_DAYS, type Severity, type Verify } from "@/engine/rules";
import { initialState, type Settings, type Theme } from "@/engine/state";
import { makeBundle, readBundle } from "@/storage/adapter";
import { course } from "@/lib/course";
import { startDsa } from "@/engine/dsa";

export default function SettingsPage() {
  const { state, act, replace, toast } = useGame();
  const s = state.settings;
  const set = (patch: Partial<Settings>) => act((d, c) => updateSettings(d, c, patch));
  const toggleMethod = (m: MethodId) => set({ methods: s.methods.includes(m) ? s.methods.filter((x) => x !== m) : [...s.methods, m] });
  const [stasisDays, setStasisDays] = useState(7);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDsaReset, setConfirmDsaReset] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(makeBundle(state, new Date()), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gosteps-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const next = readBundle(JSON.parse(await file.text()));
      await replace(next);
      setImportMsg(`Imported backup for ${next.player.name}.`);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Import failed.");
    }
  };

  return (
    <>
      <div>
        <div className="eyebrow">Your data stays on this device</div>
        <h1 className="page-title">Settings</h1>
      </div>

      <Panel title="Learning methods">
        <div className="grid-cols">
          {METHOD_IDS.map((id) => {
            const m = METHODS[id];
            const on = s.methods.includes(id);
            return (
              <label key={id} className={`option ${on ? "on" : ""}`}>
                <span className="row" style={{ justifyContent: "space-between" }}>
                  <span className="name">{m.name}</span>
                  <input type="checkbox" checked={on} onChange={() => toggleMethod(id)} aria-label={m.name} />
                </span>
                <span className="small muted">{m.evidence}</span>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{m.effects.map((e) => <li key={e}>{e}</li>)}</ul>
              </label>
            );
          })}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Changes to Daily Orders apply from the next day&apos;s orders.</p>
      </Panel>

      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Panel title="Severity">
          <div className="stack">
            {(Object.keys(SEVERITIES) as Severity[]).map((k) => (
              <label key={k} className={`option ${s.severity === k ? "on" : ""}`}>
                <span className="row" style={{ justifyContent: "space-between" }}>
                  <span className="name">{SEVERITIES[k].name}</span>
                  <input type="radio" name="severity" checked={s.severity === k} onChange={() => set({ severity: k })} />
                </span>
                <span className="small muted">{SEVERITIES[k].blurb}</span>
              </label>
            ))}
            <label className="check"><input type="checkbox" checked={s.autoUseTokens} onChange={(e) => set({ autoUseTokens: e.target.checked })} /> Spend a Rest Token automatically when a day is missed</label>
          </div>
        </Panel>

        <Panel title="Rest and Stasis">
          <div className="stack">
            <p className="small" style={{ margin: 0 }}>Rest Tokens: <b>{state.player.restTokens}</b> / {SEVERITIES[s.severity].maxTokens}. You earn one for every 7 days you meet your orders.</p>
            <div><button type="button" className="btn sm ghost" onClick={() => act((d, c) => { if (!spendRestToken(d, c)) toast("Today is already met or covered"); else toast("Today is a rest day"); })}>Rest today</button></div>
            {state.player.stasis ? (
              <>
                <p className="small" style={{ margin: 0 }}>Stasis until {new Date(state.player.stasis.until).toLocaleDateString()}. Everything is frozen.</p>
                <div><button type="button" className="btn sm" onClick={() => act((d, c) => endStasis(d, c))}>End Stasis now</button></div>
              </>
            ) : (
              <div className="row">
                <label className="field" style={{ width: 120 }}>Days
                  <input type="number" id="stasis-days" min={1} max={STASIS_MAX_DAYS} value={stasisDays} onChange={(e) => setStasisDays(Number(e.target.value))} />
                </label>
                <button type="button" className="btn sm ghost" style={{ alignSelf: "end" }}
                  onClick={() => act((d, c) => { if (!startStasis(d, c, stasisDays)) toast("Stasis is on cooldown"); })}>Enter Stasis</button>
              </div>
            )}
            <p className="small muted" style={{ margin: 0 }}>Stasis (vacation mode) pauses decay, penalties, and card due dates, for up to {STASIS_MAX_DAYS} days, with a 7-day cooldown.</p>
          </div>
        </Panel>

        <Panel title="Study">
          <div className="stack">
            <label className="field">Your plan (implementation intention)
              <input type="text" id="intention" value={s.intention} onChange={(e) => set({ intention: e.target.value })} />
            </label>
            <div className="row">
              <label className="field" style={{ flex: 1 }}>Focus minutes
                <input type="number" id="pomo-work" min={5} max={90} value={s.pomodoroWork} onChange={(e) => set({ pomodoroWork: Number(e.target.value) || 25 })} />
              </label>
              <label className="field" style={{ flex: 1 }}>Break minutes
                <input type="number" id="pomo-break" min={1} max={30} value={s.pomodoroBreak} onChange={(e) => set({ pomodoroBreak: Number(e.target.value) || 5 })} />
              </label>
            </div>
            <div className="row">
              <label className="field" style={{ flex: 1 }}>Daily review cap
                <input type="number" id="review-cap" min={5} max={100} value={s.reviewCap} onChange={(e) => set({ reviewCap: Number(e.target.value) || 15 })} />
              </label>
              <label className="field" style={{ flex: 1 }}>Day starts at
                <select id="boundary" value={s.dayBoundaryHour} onChange={(e) => set({ dayBoundaryHour: Number(e.target.value) })}>
                  {[0, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </label>
            </div>
            <label className="field">Verification
              <select id="verification" value={s.verification} onChange={(e) => set({ verification: e.target.value as Verify })}>
                <option value="honor">Honor system (checkbox) · 1.00× XP</option>
                <option value="evidence">Evidence: paste go test output for test/race stages · 1.25×</option>
                <option value="github">Evidence + GitHub link · 1.40×</option>
              </select>
            </label>
          </div>
        </Panel>

        <Panel title="Display">
          <div className="stack">
            <label className="field">Theme
              <select id="theme" value={s.theme} onChange={(e) => set({ theme: e.target.value as Theme })}>
                <option value="system">Match system</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} /> System chime</label>
            <label className="check"><input type="checkbox" checked={s.quietMode} onChange={(e) => set({ quietMode: e.target.checked })} /> Quiet mode: don&apos;t pop the System window open automatically</label>
          </div>
        </Panel>

        <Panel title="DSA track">
          <div className="stack">
            <label className="check"><input type="checkbox" checked={s.dsa.enabled} onChange={(e) => set({ dsa: { ...s.dsa, enabled: e.target.checked } })} /> Run the DSA track alongside the Go course</label>
            {s.dsa.start ? (
              <p className="small" style={{ margin: 0 }}>Started {s.dsa.start}: {s.dsa.goal} problems in {s.dsa.days} days.</p>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>Not started yet. Start it from the DSA page.</p>
            )}
            <div className="row">
              <label className="field" style={{ width: 130 }}>Goal
                <input type="number" id="dsa-goal-setting" min={50} max={5000} value={s.dsa.goal} onChange={(e) => set({ dsa: { ...s.dsa, goal: Number(e.target.value) || 1000 } })} />
              </label>
              <label className="field" style={{ width: 130 }}>Days
                <input type="number" id="dsa-days-setting" min={10} max={365} value={s.dsa.days} onChange={(e) => set({ dsa: { ...s.dsa, days: Number(e.target.value) || 100 } })} />
              </label>
            </div>
            {s.dsa.start && !confirmDsaReset && <div><button type="button" className="btn sm ghost" onClick={() => setConfirmDsaReset(true)}>Restart from day 1…</button></div>}
            {confirmDsaReset && (
              <div className="row">
                <span className="small">Day 1 becomes today. Problems you&apos;ve already solved still count.</span>
                <button type="button" className="btn sm" onClick={() => { act((d, c) => startDsa(d, c)); setConfirmDsaReset(false); }}>Restart today</button>
                <button type="button" className="btn sm ghost" onClick={() => setConfirmDsaReset(false)}>Cancel</button>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Storage">
          <div className="stack">
            <div className="option on">
              <span className="name">This browser (IndexedDB)</span>
              <span className="small muted">Active. No account, no server, no telemetry.</span>
            </div>
            <DiskPanel />
            <div className="option" aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>
              <span className="name">Supabase · PocketBase · Postgres API</span>
              <span className="small muted">Planned (milestone M5). Use export and import to move data meanwhile.</span>
            </div>
            <div className="row">
              <button type="button" className="btn sm" onClick={exportJson}>Export backup</button>
              <label className="btn sm ghost" style={{ cursor: "pointer" }}>
                Import backup
                <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
              </label>
            </div>
            {importMsg && <p className="small" style={{ margin: 0 }}>{importMsg}</p>}
          </div>
        </Panel>

        <Panel title="Danger zone">
          {!confirmReset ? (
            <button type="button" className="btn sm ghost" onClick={() => setConfirmReset(true)}>Reset all progress…</button>
          ) : (
            <div className="stack">
              <p className="small" style={{ margin: 0 }}>This deletes every task, card, review, and log entry on this device. Export a backup first if you might want it.</p>
              <div className="row">
                <button type="button" className="btn sm danger" onClick={() => replace(initialState(course.id, new Date()))}>Delete everything</button>
                <button type="button" className="btn sm ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

const DISK_LABEL: Record<DiskState["status"], string> = {
  checking: "Checking…",
  off: "Not running",
  ok: "Saving",
  saving: "Writing…",
  error: "Error",
  conflict: "Waiting for you",
};

function DiskPanel() {
  const { disk } = useGame();
  const on = disk.status !== "off" && disk.status !== "checking";
  return (
    <div className={`option ${on ? "on" : ""}`} style={{ cursor: "default" }}>
      <span className="row" style={{ justifyContent: "space-between" }}>
        <span className="name">This computer (file)</span>
        <span className={`chip ${disk.status === "ok" || disk.status === "saving" ? "good" : disk.status === "error" || disk.status === "conflict" ? "bad" : ""}`}>{DISK_LABEL[disk.status]}</span>
      </span>
      {disk.status === "off" || disk.status === "checking" ? (
        <span className="small muted">
          Mirrors everything to a JSON file in <code>.gosteps-data/</code> (git-ignored) when the local store is running.
          It starts automatically with <code>pnpm dev</code>, or on its own with <code>pnpm store</code>.
          {disk.status === "off" && <> <button type="button" className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => void disk.retry()}>Connect</button></>}
        </span>
      ) : (
        <>
          <span className="small" style={{ wordBreak: "break-all" }}><code>{disk.file}</code></span>
          <span className="small muted">
            {disk.savedAt ? `Last saved ${new Date(disk.savedAt).toLocaleString()}.` : "Not saved yet."} One backup per day is kept for 30 days in <code>backups/</code>.
          </span>
          {disk.error && <span className="small" style={{ color: "var(--danger)" }}>{disk.error}</span>}
          {disk.newerOnDisk && (
            <span className="small" style={{ color: "var(--warn)" }}>
              The file was saved {new Date(disk.newerOnDisk).toLocaleString()}, after this browser&apos;s last change. Saving to disk is paused until you choose which copy to keep.
            </span>
          )}
          <span className="row" style={{ marginTop: 4 }}>
            <button type="button" className="btn sm" onClick={() => void disk.loadNow()}>{disk.newerOnDisk ? "Use the file" : "Load from disk"}</button>
            <button type="button" className="btn sm ghost" onClick={() => void disk.saveNow()}>{disk.newerOnDisk ? "Keep this browser's data" : "Save now"}</button>
          </span>
        </>
      )}
    </div>
  );
}
