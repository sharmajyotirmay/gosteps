"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { scaffold } from "@/ide/client";
import { useGame } from "@/components/GameProvider";
import { InlineCode, Markdown, Panel } from "@/components/ui";
import { dailyCounts, logProblem, pace, patternKey, gateKey, planDayKey, problemXP, redoQueue, startDsa, studyPattern, submitGate, topicForDay, uniqueSolved } from "@/engine/dsa";
import { DIFFICULTIES, problemUrl, tagUrl, toSlug, type Difficulty, type DsaPhase } from "@/engine/dsa-track";
import { today } from "@/engine/game";
import type { ProblemOutcome, SolvedProblem } from "@/engine/state";
import { dsa, dsaTrack, idx } from "@/lib/course";

const OUTCOMES: { id: ProblemOutcome; label: string }[] = [
  { id: "solved", label: "Solved" },
  { id: "hint", label: "Needed a hint" },
  { id: "failed", label: "Couldn't solve" },
];

const pkg = (slug: string) => slug.replace(/-/g, "_").replace(/^(\d)/, "p$1");

export default function DsaPage() {
  const { state, now, act, toast } = useGame();
  const ctx = { idx, dsa, now, newId: () => "" };
  const p = pace(state, ctx);
  const day = today(state, ctx);
  const solved = useMemo(() => uniqueSolved(state), [state]);
  const current = p ? topicForDay(dsa, Math.min(Math.max(p.day, 1), p.daysTotal), p.daysTotal) : dsa.topics[0];
  const [selected, setSelected] = useState(current.id);
  const topic = dsa.topicById.get(selected) ?? current;
  const phase = dsa.phaseOfTopic.get(topic.id)!;

  // Log form
  const [problem, setProblem] = useState("");
  const anchor = dsa.anchorBySlug.get(toSlug(problem));
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [outcome, setOutcome] = useState<ProblemOutcome>("solved");
  const [inGo, setInGo] = useState(true);
  const [minutes, setMinutes] = useState("");
  const diff = anchor?.problem.difficulty ?? difficulty;
  const projected = problemXP(diff, outcome, inGo, dsa.phaseOfTopic.get(anchor?.topicId ?? topic.id)?.index ?? 1);

  const submit = (input: { problem: string; difficulty: Difficulty; outcome: ProblemOutcome; inGo: boolean; minutes?: number | null; topicId?: string }) => {
    act((d, c) => { logProblem(d, c, input); });
    toast(`Logged · +${problemXP(input.difficulty, input.outcome, input.inGo, dsa.phaseOfTopic.get(input.topicId ?? topic.id)?.index ?? 1)} XP`);
  };

  const onLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toSlug(problem)) return;
    submit({ problem, difficulty: diff, outcome, inGo, minutes: minutes ? Number(minutes) : null, topicId: anchor?.topicId ?? topic.id });
    setProblem("");
    setMinutes("");
    setOutcome("solved");
  };

  if (!state.settings.dsa.enabled) {
    return (
      <Panel title="DSA track">
        <p style={{ marginTop: 0 }}>The DSA track is turned off. Turn it on in Settings.</p>
      </Panel>
    );
  }

  if (!p) return <StartPanel onStart={(goal, days) => act((d, c) => startDsa(d, c, { goal, days }))} />;

  const counts = dailyCounts(state);
  const redo = redoQueue(state, now);
  const recent = Object.values(state.problems).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
  const avg = p.day > 0 ? p.solved / Math.min(p.day, p.daysTotal) : 0;
  const projectedTotal = Math.round(avg * p.daysTotal);

  return (
    <>
      <div>
        <div className="eyebrow">DSA track · solved in Go · feeds your level, stats, and streak</div>
        <h1 className="page-title">{p.goal} Problems in {p.daysTotal} Days</h1>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <Panel title={`Day ${Math.min(p.day, p.daysTotal)} of ${p.daysTotal}`}>
          <div className="stack">
            <div className="big-num">{p.solved}<small> / {p.goal} solved</small></div>
            <div className="xpbar" role="progressbar" aria-label="Problems solved" aria-valuemin={0} aria-valuemax={p.goal} aria-valuenow={p.solved}>
              <div className="fill" style={{ width: `${Math.min(100, (p.solved / p.goal) * 100)}%`, background: "var(--violet)" }} />
              <div className="esc" style={{ left: `${Math.min(100, (p.solved / p.goal) * 100)}%`, width: `${Math.max(0, Math.min(100, (p.expected - p.solved) / p.goal * 100))}%` }} />
            </div>
            <div className="row">
              <span className="chip"><b>{p.todaySolved}</b> / {p.target} today</span>
              <span className={`chip ${p.delta >= 0 ? "good" : p.delta > -p.target ? "warn" : "bad"}`}>
                {p.delta >= 0 ? `${p.delta} ahead of pace` : `${-p.delta} behind pace`}
              </span>
              <span className="chip">{p.daysLeft} days left</span>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              On-pace target for today is {p.expected} total. Your average is {avg.toFixed(1)} a day, which projects to about {projectedTotal} by day {p.daysTotal}.
              The daily target adjusts to catch you up, but never above 20.
            </p>
          </div>
        </Panel>

        <Panel title="100-day map">
          <div className="heat" role="img" aria-label={`Problems solved per day for ${p.daysTotal} days`}>
            {Array.from({ length: p.daysTotal }, (_, i) => {
              const k = planDayKey(state.settings.dsa.start!, i + 1);
              const n = counts.get(k) ?? 0;
              const isFuture = i + 1 > p.day;
              const isToday = k === day;
              return (
                <span
                  key={k}
                  title={`Day ${i + 1} · ${k}: ${n} solved`}
                  className={`${isFuture ? "future" : ""} ${isToday ? "today" : ""} ${!isFuture && !isToday && n === 0 ? "miss" : ""}`}
                  style={{ ["--v" as string]: Math.min(1, n / 10) }}
                />
              );
            })}
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>One square per day. Brighter means more problems, full brightness is 10 or more, and a red edge marks a day with none.</p>
        </Panel>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)" }}>
        <div className="col">
          <Panel title={topic.id === current.id ? "Today's topic" : "Topic"}>
            <div className="stack">
              <div>
                <div className="eyebrow">Phase {phase.index}: {phase.title} · Days {dsa.topicStartDay.get(topic.id)}–{dsa.topicStartDay.get(topic.id)! + topic.days - 1}</div>
                <h2 style={{ margin: "4px 0 0", font: "600 22px/1.2 var(--display)" }}>{topic.title}</h2>
              </div>
              <details open={!state.progress[patternKey(topic.id)]}>
                <summary style={{ cursor: "pointer" }} className="small">Pattern notes {state.progress[patternKey(topic.id)] ? "· studied ✓" : ""}</summary>
                <div style={{ marginTop: 10 }}><Markdown>{topic.pattern}</Markdown></div>
              </details>
              {!state.progress[patternKey(topic.id)] && (
                <div><button type="button" className="btn sm" onClick={() => act((d, c) => studyPattern(d, c, topic.id))}>I studied this pattern · +10 XP, adds {topic.cards.length} review cards</button></div>
              )}
              <div className="stage-label">Anchor problems · {topic.problems.filter((x) => solved.has(x.slug)).length}/{topic.problems.length}</div>
              <ul className="plist">
                {topic.problems.map((x) => {
                  const done = solved.has(x.slug);
                  return (
                    <li key={x.slug} className={done ? "solved" : ""}>
                      <span className={`diff ${x.difficulty}`}>{x.difficulty}</span>
                      <a className="ptitle-link" href={problemUrl(x.slug)} target="_blank" rel="noreferrer">{x.title}</a>
                      {done ? <span className="chip good">✓</span> : (
                        <button type="button" className="btn sm ghost" onClick={() => { setProblem(x.slug); document.getElementById("dsa-problem")?.focus(); }}>Log</button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="small" style={{ margin: 0 }}>
                Fill the rest of today&apos;s {p.target} from these tags:{" "}
                {topic.tags.map((t, i) => <span key={t}>{i ? ", " : ""}<a href={tagUrl(t)} target="_blank" rel="noreferrer">{t}</a></span>)}.
                Pick problems you haven&apos;t seen, mostly easy and medium.
              </p>
            </div>
          </Panel>

          <Panel title="Recent">
            {recent.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Nothing logged yet. Your first problem is one form away.</p> : (
              <div className="scroll">
                <table className="data">
                  <thead><tr><th>Problem</th><th>Result</th><th>Topic</th><th className="num">XP</th></tr></thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.id}>
                        <td><span className={`diff ${r.difficulty}`}>{r.difficulty[0]}</span> <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>{r.inGo ? <span className="muted"> · Go</span> : null}</td>
                        <td className={r.outcome === "solved" ? "plus" : r.outcome === "hint" ? "hold" : "minus"}>{OUTCOMES.find((o) => o.id === r.outcome)?.label}</td>
                        <td className="muted">{dsa.topicById.get(r.topicId)?.title}</td>
                        <td className="num">+{r.xp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <aside className="col">
          <Panel title="Log a problem">
            <form id="log" className="stack" onSubmit={onLog}>
              <label className="field">LeetCode URL, slug, or title
                <input type="text" id="dsa-problem" list="dsa-anchors" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="https://leetcode.com/problems/two-sum/" autoComplete="off" />
                <datalist id="dsa-anchors">{dsa.topics.flatMap((t) => t.problems).map((x) => <option key={x.slug} value={x.slug}>{x.title}</option>)}</datalist>
              </label>
              {anchor && <div className="small muted">{anchor.problem.title} · {dsa.topicById.get(anchor.topicId)?.title}</div>}
              {!anchor && (
                <div className="seg" role="radiogroup" aria-label="Difficulty">
                  {DIFFICULTIES.map((d) => (
                    <label key={d}><input type="radio" name="dsa-diff" checked={difficulty === d} onChange={() => setDifficulty(d)} />{d}</label>
                  ))}
                </div>
              )}
              <div className="seg" role="radiogroup" aria-label="Result">
                {OUTCOMES.map((o) => (
                  <label key={o.id}><input type="radio" name="dsa-outcome" checked={outcome === o.id} onChange={() => setOutcome(o.id)} />{o.label}</label>
                ))}
              </div>
              <div className="row">
                <label className="check"><input type="checkbox" checked={inGo} onChange={(e) => setInGo(e.target.checked)} /> Solved in Go (+20% XP, +FND)</label>
              </div>
              <label className="field" style={{ maxWidth: 160 }}>Minutes (optional)
                <input type="number" id="dsa-minutes" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </label>
              <div className="row">
                <button type="submit" className="btn" disabled={!toSlug(problem)}>Log · +{projected} XP</button>
                {solved.has(toSlug(problem)) && <span className="small muted">Already counted. Logging it again won&apos;t add to the {p.goal}.</span>}
              </div>
              <p className="small muted" style={{ margin: 0 }}>Hints and failed attempts come back in your redo queue (1 to 3 days later), because re-solving without help is what makes a pattern stick.</p>
            </form>
          </Panel>

          <GoScaffold slug={toSlug(problem) || topic.problems.find((x) => !solved.has(x.slug))?.slug || topic.problems[0].slug} topicId={anchor?.topicId ?? topic.id} />

          <Panel title={`Redo queue · ${redo.length}${redo.length > 5 ? " (next 5)" : ""}`}>
            {redo.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Nothing to redo right now.</p> : (
              <ul className="plist">
                {redo.slice(0, 5).map((r) => <RedoRow key={r.id} r={r} onLog={submit} />)}
              </ul>
            )}
          </Panel>

          <Panel title="Plan">
            <div className="stack" style={{ gap: 2 }}>
              {dsaTrack.phases.map((ph) => (
                <PhaseBlock key={ph.id} phase={ph} currentId={current.id} selectedId={topic.id} solved={solved} onSelect={setSelected} />
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );

}

function PhaseBlock({ phase: ph, currentId, selectedId, solved: done, onSelect }: { phase: DsaPhase; currentId: string; selectedId: string; solved: Set<string>; onSelect: (id: string) => void }) {
  const { state } = useGame();
  const cleared = Boolean(state.progress[gateKey(ph.boss.id)]);
  return (
    <div className="stack" style={{ gap: 2, marginBottom: 8 }}>
      <div className="stage-label">Phase {ph.index} · {ph.title}</div>
      {ph.topics.map((t) => {
        const start = dsa.topicStartDay.get(t.id)!;
        return (
          <button type="button" key={t.id} className={`topic-row ${t.id === currentId ? "now" : ""} ${t.id === selectedId ? "sel" : ""}`} onClick={() => onSelect(t.id)}>
            <span className="eyebrow">{t.days > 1 ? `D${start}–${start + t.days - 1}` : `D${start}`}</span>
            <span className="small">{t.title}</span>
            <span className="small muted">{t.problems.filter((x) => done.has(x.slug)).length}/{t.problems.length}</span>
          </button>
        );
      })}
      <details className="small" style={{ padding: "6px 8px" }}>
        <summary style={{ cursor: "pointer", color: cleared ? "var(--good)" : "var(--danger)" }}>
          Gate Trial: {ph.boss.title} {cleared ? "· cleared ✓" : `· ${ph.boss.problems} in ${ph.boss.minutes} min`}
        </summary>
        <div style={{ marginTop: 8 }}><InlineCode text={ph.boss.body} /></div>
        {!cleared && <GateForm phase={ph} />}
      </details>
    </div>
  );
}

function GateForm({ phase: ph }: { phase: DsaPhase }) {
  const { act } = useGame();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [solvedN, setSolvedN] = useState(ph.boss.problems);
  const [mins, setMins] = useState("");
  if (startedAt === null) {
    return <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => setStartedAt(Date.now())}>Start the clock</button>;
  }
  return (
    <form className="stack" style={{ marginTop: 8 }} onSubmit={(e) => {
      e.preventDefault();
      const m = mins ? Number(mins) : Math.ceil((Date.now() - startedAt) / 60_000);
      act((d, c) => { submitGate(d, c, ph.id, solvedN, m); });
    }}>
      <span className="muted">Started {new Date(startedAt).toLocaleTimeString()}. Submit when you finish or the time runs out.</span>
      <div className="row">
        <label className="field" style={{ width: 110 }}>Accepted
          <input type="number" min={0} max={ph.boss.problems} value={solvedN} onChange={(e) => setSolvedN(Number(e.target.value))} />
        </label>
        <label className="field" style={{ width: 130 }}>Minutes (auto)
          <input type="number" min={1} value={mins} placeholder="auto" onChange={(e) => setMins(e.target.value)} />
        </label>
        <button type="submit" className="btn sm" style={{ alignSelf: "end" }}>Submit</button>
      </div>
    </form>
  );
}

function GoScaffold({ slug, topicId }: { slug: string; topicId: string }) {
  const { toast } = useGame();
  const dir = `${topicId}/${pkg(slug)}`;
  const cmd = [
    `cd ~/Dev/dsa-go   # once: mkdir -p ~/Dev/dsa-go && cd ~/Dev/dsa-go && go mod init dsa`,
    `mkdir -p ${dir} && cd ${dir}`,
    `printf 'package ${pkg(slug)}\n' > solution.go`,
    `printf 'package ${pkg(slug)}\n\nimport "testing"\n\nfunc TestSolution(t *testing.T) {\n\t// table-driven cases from the examples\n}\n' > solution_test.go`,
    `go test ./...`,
  ].join("\n");
  const copy = () => navigator.clipboard?.writeText(cmd).then(() => toast("Copied"), () => toast("Copy failed: select the text instead"));
  const router = useRouter();
  const openInIde = async () => {
    try {
      const anchor = dsa.anchorBySlug.get(slug);
      const path = await scaffold({ module: "dsa-go", dir: dir, pkg: pkg(slug), title: anchor?.problem.title ?? slug, url: problemUrl(slug) });
      router.push(`/ide?open=${encodeURIComponent(path)}`);
    } catch {
      toast("The IDE runner isn't running. Start it with `pnpm dev` (or `pnpm ide`).");
    }
  };
  return (
    <Panel title="Solve it in Go">
      <div className="stack">
        <p className="small" style={{ margin: 0 }}>One package per problem, with a table-driven test. This is your Go practice too.</p>
        <pre className="md" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--code-bg)", border: "1px solid var(--panel-edge)", padding: "10px 12px", font: "12px/1.5 var(--mono)" }}>{cmd}</pre>
        <div className="row">
          <button type="button" className="btn sm" onClick={() => void openInIde()}>Open in IDE</button>
          <button type="button" className="btn sm ghost" onClick={copy}>Copy commands</button>
        </div>
      </div>
    </Panel>
  );
}

function RedoRow({ r, onLog }: { r: SolvedProblem; onLog: (i: { problem: string; difficulty: Difficulty; outcome: ProblemOutcome; inGo: boolean; topicId: string }) => void }) {
  const go = (outcome: ProblemOutcome) => onLog({ problem: r.slug, difficulty: r.difficulty, outcome, inGo: r.inGo, topicId: r.topicId });
  return (
    <li style={{ gridTemplateColumns: "auto 1fr" }}>
      <span className={`diff ${r.difficulty}`}>{r.difficulty[0]}</span>
      <span style={{ minWidth: 0 }}>
        <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
        <span className="row" style={{ marginTop: 6, gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => go("solved")}>Solved it</button>
          <button type="button" className="btn sm ghost" onClick={() => go("hint")}>Hint again</button>
          <button type="button" className="btn sm ghost" onClick={() => go("failed")}>Still stuck</button>
        </span>
      </span>
    </li>
  );
}

function StartPanel({ onStart }: { onStart: (goal: number, days: number) => void }) {
  const [goal, setGoal] = useState(1000);
  const [days, setDays] = useState(100);
  return (
    <>
      <div>
        <div className="eyebrow">New track</div>
        <h1 className="page-title">{dsaTrack.title}</h1>
      </div>
      <Panel title="The challenge">
        <div className="stack">
          <p style={{ margin: 0, maxWidth: "70ch" }}>{dsaTrack.description}</p>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>{dsaTrack.phases.length} phases, {dsa.topics.length} topics, {dsa.anchorBySlug.size} curated anchor problems (all verified free on LeetCode), plus tag lists for the rest.</li>
            <li>Every problem gives XP, the <b>ALG</b> stat, and progress on a <b>DSA</b> order in your Daily Orders, on the same level, rank, and streak as your Go quests.</li>
            <li>Solving in Go earns +20% XP and Fundamentals. Each pattern adds review cards to the same FSRS deck.</li>
            <li>The daily target starts at goal ÷ days and adjusts to catch you up (5 to 20 a day).</li>
          </ul>
          <div className="row">
            <label className="field" style={{ width: 140 }}>Problems
              <input type="number" id="dsa-goal" min={50} max={5000} value={goal} onChange={(e) => setGoal(Number(e.target.value) || 1000)} />
            </label>
            <label className="field" style={{ width: 140 }}>Days
              <input type="number" id="dsa-days" min={10} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 100)} />
            </label>
            <button type="button" className="btn" style={{ alignSelf: "end" }} onClick={() => onStart(goal, days)}>Start day 1 today</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>About {Math.ceil(goal / days)} problems a day. At roughly 15 minutes each, that&apos;s about {Math.round((goal / days) * 15 / 6) / 10} hours a day, so plan your Go quests around it.</p>
        </div>
      </Panel>
    </>
  );
}
