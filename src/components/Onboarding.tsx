"use client";

import { useState } from "react";
import { onboard } from "@/engine/game";
import { BALANCED_PRESET, METHOD_IDS, METHODS, type MethodId } from "@/engine/methods";
import { SEVERITIES, type Severity } from "@/engine/rules";
import { course, dsaTrack } from "@/lib/course";
import { startDsa } from "@/engine/dsa";
import { useGame } from "./GameProvider";
import { Panel } from "./ui";

const STEPS = ["Register", "Course", "Methods", "Severity"] as const;

export function Onboarding() {
  const { act } = useGame();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [intention, setIntention] = useState("");
  const [boundary, setBoundary] = useState(4);
  const [methods, setMethods] = useState<MethodId[]>([...BALANCED_PRESET]);
  const [severity, setSeverity] = useState<Severity>("standard");

  const toggle = (m: MethodId) => setMethods((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));
  const [withDsa, setWithDsa] = useState(true);
  const finish = () =>
    act((d, c) => {
      onboard(d, c, { name, methods, severity, intention, dayBoundaryHour: boundary });
      if (withDsa) startDsa(d, c);
      else d.settings.dsa.enabled = false;
    });

  return (
    <div className="stack" style={{ maxWidth: 780, margin: "0 auto", width: "100%" }}>
      <section className="panel notice">
        <span className="tag">NOTICE</span>
        <div>
          <div className="who">The Registry</div>
          <p>A new player has been detected. Complete registration to receive your first Daily Orders.</p>
        </div>
      </section>

      <ol className="steps" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }} aria-label="Registration steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? "done" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}>{s}</li>
        ))}
      </ol>

      {step === 0 && (
        <Panel title="Register">
          <div className="stack">
            <label className="field">What should the Registry call you?
              <input type="text" id="ob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
            </label>
            <label className="field">Your plan: when and where will you study? (&ldquo;After dinner at my desk, I open the jobq repo.&rdquo;)
              <input type="text" id="ob-intent" value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="When …, I will …" />
            </label>
            <p className="small muted">Plans like this (implementation intentions) roughly double follow-through in studies. They show up on your dashboard every day.</p>
            <label className="field" style={{ maxWidth: 260 }}>A new day starts at
              <select id="ob-boundary" value={boundary} onChange={(e) => setBoundary(Number(e.target.value))}>
                {[0, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </label>
          </div>
        </Panel>
      )}

      {step === 1 && (
        <Panel title="Course">
          <div className="option on">
            <span className="name">{course.title}</span>
            <span className="small muted">{course.description}</span>
            <span className="small">{course.phases.length} phases · {course.phases.reduce((n, p) => n + p.quests.length, 0)} quests · every quest follows the Learning Rule: {course.learningRule.map((s) => s.name).join(" → ")}</span>
          </div>
          <label className={`option ${withDsa ? "on" : ""}`} style={{ marginTop: 10 }}>
            <span className="row" style={{ justifyContent: "space-between" }}>
              <span className="name">{dsaTrack.title}</span>
              <input type="checkbox" checked={withDsa} onChange={(e) => setWithDsa(e.target.checked)} aria-label="Also start the DSA track" />
            </span>
            <span className="small muted">{dsaTrack.description}</span>
            <span className="small">Runs alongside the Go course: every problem adds XP, the ALG stat, and progress on a DSA order in your Daily Orders. Day 1 starts today.</span>
          </label>
          <p className="small muted">You&apos;ll build the Go project and solve problems on your own machine. The app tracks quests, problems, reviews, and evidence.</p>
        </Panel>
      )}

      {step === 2 && (
        <Panel title="Learning methods">
          <p className="small muted" style={{ marginTop: 0 }}>Each method changes what you actually do, not just labels. &ldquo;Balanced&rdquo; is preselected. You can change this any time in Settings.</p>
          <div className="grid-cols">
            {METHOD_IDS.map((id) => {
              const m = METHODS[id];
              const on = methods.includes(id);
              return (
                <label key={id} className={`option ${on ? "on" : ""}`}>
                  <span className="row" style={{ justifyContent: "space-between" }}>
                    <span className="name">{m.name}</span>
                    <input type="checkbox" checked={on} onChange={() => toggle(id)} aria-label={m.name} />
                  </span>
                  <span className="small muted">{m.evidence}</span>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{m.effects.map((e) => <li key={e}>{e}</li>)}</ul>
                </label>
              );
            })}
          </div>
        </Panel>
      )}

      {step === 3 && (
        <Panel title="Severity">
          <div className="stack">
            {(Object.keys(SEVERITIES) as Severity[]).map((k) => {
              const s = SEVERITIES[k];
              return (
                <label key={k} className={`option ${severity === k ? "on" : ""}`}>
                  <span className="row" style={{ justifyContent: "space-between" }}>
                    <span className="name">{s.name}{k === "gentle" ? " (recommended to start)" : ""}</span>
                    <input type="radio" name="sev" checked={severity === k} onChange={() => setSeverity(k)} />
                  </span>
                  <span className="small">{s.blurb}</span>
                  <span className="small muted">Rest Tokens: up to {s.maxTokens}. You earn one every 7 days you meet your orders.</span>
                </label>
              );
            })}
            <p className="small muted">If you miss 3 days: Gentle issues a Penalty Quest and holds new XP until you clear it. Standard also takes about 13 + 26 XP at level 15. Hardcore takes about 26 + 51 XP. Nothing is ever lost below your rank floor, and Stasis (vacation mode) freezes everything.</p>
          </div>
        </Panel>
      )}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>Back</button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn" onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !name.trim()}>Next</button>
        ) : (
          <button type="button" className="btn" onClick={finish} disabled={methods.length === 0}>Accept the System</button>
        )}
      </div>
    </div>
  );
}
