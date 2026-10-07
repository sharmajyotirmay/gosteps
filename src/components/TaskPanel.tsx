"use client";

import { useMemo, useState } from "react";
import type { Criterion, Quest, Task } from "@/engine/course";
import { checkCriteria, COMMIT_URL, parseGoTest } from "@/engine/evidence";
import { completedSessions, completeTask, recordAttempt, writeReflection } from "@/engine/game";
import { has } from "@/engine/methods";
import { pomodoroMult, taskXP, type Verify } from "@/engine/rules";
import { idx } from "@/lib/course";
import { useGame } from "./GameProvider";
import { runInSandbox } from "@/ide/client";
import { PomodoroTimer } from "./PomodoroTimer";
import { InlineCode, Markdown } from "./ui";

const REFLECT_PROMPTS = ["What did I build?", "What surprised me, or what did I get wrong at first?", "What will I do differently next time?"];

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function TaskPanel({ task, quest }: { task: Task; quest?: Quest }) {
  const { state, act, toast } = useGame();
  const m = state.settings.methods;
  const done = state.progress[task.id];
  const phaseIndex = idx.phaseIndexOfTask.get(task.id)!;

  const reads = quest?.tasks.filter((t) => t.stage === "understand") ?? [];
  const recallGate = has(m, "recall") && task.type === "read" && !done;
  const quizItem = reads[0]?.id === task.id ? quest?.quiz[0] : undefined;
  const recallPrompt = quizItem?.q ?? `Before reading: what do you already know about "${task.title}"? Guesses count.`;
  const feynmanGate = has(m, "feynman") && task.type === "read" && reads.at(-1)?.id === task.id && !done;
  const pomodoro = has(m, "pomodoro") && (task.type === "implement" || task.type === "test");
  const reflectGate = task.type === "reflect" && !done;
  const verification = state.settings.verification;
  const evidenceNeeded = task.evidence.length > 0 && (task.type === "boss" || verification !== "honor");

  const [recallAnswer, setRecallAnswer] = useState("");
  const [revealed, setRevealed] = useState(!recallGate);
  const [grade, setGrade] = useState<"had" | "partly" | "missed" | null>(null);
  const [explain, setExplain] = useState("");
  const [answers, setAnswers] = useState(["", "", ""]);
  const [output, setOutput] = useState("");
  const [raceConfirmed, setRaceConfirmed] = useState(false);
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [goleakConfirmed, setGoleakConfirmed] = useState(false);
  const [commitUrl, setCommitUrl] = useState("");
  const [honor, setHonor] = useState(false);

  const criteria: Criterion[] = useMemo(() => {
    const c = [...task.evidence];
    if (verification === "github" && evidenceNeeded && !c.some((x) => x.kind === "github-commit")) c.push({ kind: "github-commit" });
    return c;
  }, [task.evidence, verification, evidenceNeeded]);
  const report = useMemo(() => (output.trim() ? parseGoTest(output) : null), [output]);
  const results = report ? checkCriteria(criteria, report, { raceConfirmed, goleakConfirmed, commitUrl }) : [];
  const evidenceOk = !evidenceNeeded || (results.length > 0 && results.every((r) => r.ok));

  const missingTerms = (quest?.terms ?? []).filter((t) => !explain.toLowerCase().includes(t.toLowerCase().replace(/\(\)$/, "")));
  const feynmanOk = !feynmanGate || words(explain) >= 40;
  const recallOk = !recallGate || (revealed && grade !== null);
  const reflectOk = !reflectGate || answers.every((a) => words(a) >= 3);
  const honorOk = evidenceNeeded || reflectGate || honor;
  const canComplete = !done && recallOk && feynmanOk && reflectOk && evidenceOk && honorOk;

  const verify: Verify = evidenceNeeded ? (COMMIT_URL.test(commitUrl.trim()) ? "github" : "evidence") : "honor";
  const sessions = completedSessions(state, task.id);
  const projected = taskXP({
    type: task.type,
    phaseIndex,
    verify,
    methodMult: pomodoro ? pomodoroMult(sessions, task.sessions ?? 1) : 1,
  });

  // Flags the criteria need: -race for race/leak checks, -cover for coverage, -bench for benchmarks.
  const sandboxFlags = {
    race: task.evidence.some((c) => c.kind === "go-test-race" || c.kind === "goleak"),
    cover: task.evidence.some((c) => c.kind === "coverage"),
    bench: task.evidence.some((c) => c.kind === "go-bench"),
  };
  const runSandboxEvidence = async () => {
    setSandboxBusy(true);
    setOutput("");
    try {
      const res = await runInSandbox(
        { module: "jobq", action: "test", race: sandboxFlags.race, cover: sandboxFlags.cover, ...(sandboxFlags.bench ? { bench: ".", run: "." } : {}) },
        { output: (d) => setOutput((o) => o + d) },
      );
      // The app ran it with -race itself, so no need to ask.
      if (sandboxFlags.race && res.code === 0) setRaceConfirmed(true);
      if (res.timedOut) toast("The sandbox run timed out");
    } catch {
      toast("The IDE runner isn't running. Start it with `pnpm dev` (or `pnpm ide`) and Docker Desktop.");
    } finally {
      setSandboxBusy(false);
    }
  };

  const complete = () => {
    act((d, c) => {
      if (recallGate) recordAttempt(d, c, task.id, "recall", { prompt: recallPrompt, answer: recallAnswer, grade }, grade !== "missed");
      if (feynmanGate) writeReflection(d, c, [explain], { taskId: task.id, kind: "feynman" });
      if (reflectGate) writeReflection(d, c, answers, { taskId: task.id, kind: "task" });
      if (evidenceNeeded && report) {
        recordAttempt(d, c, task.id, "evidence", { coverage: report.coverage, races: report.races, packages: report.packages.length, commitUrl }, true);
      }
      completeTask(d, c, task.id, { verify, sessions });
    });
    toast(`Task complete · +${projected} XP${state.player.escrowXP || Object.values(state.penalties).some((p) => !p.clearedAt) ? " (held)" : ""}`);
  };

  if (done) {
    return (
      <div className="task-body">
        <Markdown>{task.body}</Markdown>
        <p className="small muted" style={{ margin: 0 }}>
          Completed {new Date(done.completedAt).toLocaleString()} · {done.verify} · +{done.xp} XP
        </p>
      </div>
    );
  }

  return (
    <div className="task-body">
      {recallGate && (
        <div className="gate">
          <h4>Active recall</h4>
          <p style={{ margin: 0 }}><InlineCode text={recallPrompt} /></p>
          <textarea id={`recall-${task.id}`} aria-label="Your answer" value={recallAnswer} onChange={(e) => setRecallAnswer(e.target.value)} placeholder="Answer from memory before you look…" disabled={revealed} />
          {!revealed ? (
            <div><button type="button" className="btn sm" disabled={words(recallAnswer) < 2} onClick={() => setRevealed(true)}>Reveal the notes</button></div>
          ) : (
            <>
              {quizItem && <div className="small"><b>Model answer</b><Markdown>{quizItem.a}</Markdown></div>}
              <div className="row small">
                How did you do?
                {(["had", "partly", "missed"] as const).map((g) => (
                  <button key={g} type="button" className={`btn sm ${grade === g ? "" : "ghost"}`} onClick={() => setGrade(g)}>
                    {g === "had" ? "I had it" : g === "partly" ? "Partly" : "Missed it"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {revealed && <Markdown>{task.body}</Markdown>}

      {revealed && feynmanGate && (
        <div className="gate gold">
          <h4>Explain it to a junior</h4>
          <p className="small" style={{ margin: 0 }}>In plain words (40+), explain this quest&apos;s idea to someone who started Go last week.</p>
          <textarea id={`feynman-${task.id}`} aria-label="Your explanation" value={explain} onChange={(e) => setExplain(e.target.value)} />
          <div className="small muted">{words(explain)} words</div>
          {explain && missingTerms.length > 0 && (
            <div className="small">
              <b>Gaps to consider:</b> could you work in {missingTerms.slice(0, 4).map((t, i) => <span key={t}>{i ? ", " : ""}<code>{t}</code></span>)}? What role does each play?
            </div>
          )}
        </div>
      )}

      {pomodoro && <PomodoroTimer taskId={task.id} estimate={task.sessions ?? 1} />}

      {reflectGate && (
        <div className="gate gold">
          <h4>Reflection</h4>
          {REFLECT_PROMPTS.map((p, i) => (
            <label key={p} className="field">{p}
              <textarea id={`reflect-${task.id}-${i}`} value={answers[i]} style={{ minHeight: 64 }} onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
            </label>
          ))}
        </div>
      )}

      {evidenceNeeded && (
        <div className="gate">
          <h4>Evidence</h4>
          <p className="small" style={{ margin: 0 }}>Paste your <code>go test</code> output (plain text or <code>-json</code>), or run it in the sandbox on your <code>jobq</code> workspace. The app checks it on your device.</p>
          <div className="row">
            <button type="button" className="btn sm" disabled={sandboxBusy} onClick={() => void runSandboxEvidence()}>
              {sandboxBusy ? "Running in sandbox…" : `Run in sandbox: go test${sandboxFlags.race ? " -race" : ""}${sandboxFlags.cover ? " -cover" : ""}${sandboxFlags.bench ? " -bench ." : ""} ./...`}
            </button>
            <a className="small" href="/ide/">Open the IDE</a>
          </div>
          <textarea className="mono" id={`evidence-${task.id}`} aria-label="go test output" value={output} onChange={(e) => setOutput(e.target.value)} placeholder={"ok  \tgithub.com/you/jobq/internal/store\t0.41s\tcoverage: 78.2% of statements"} />
          {criteria.some((c) => c.kind === "go-test-race") && (
            <label className="check"><input type="checkbox" checked={raceConfirmed} onChange={(e) => setRaceConfirmed(e.target.checked)} /> This output is from a run with <code>-race</code></label>
          )}
          {criteria.some((c) => c.kind === "goleak") && (
            <label className="check"><input type="checkbox" checked={goleakConfirmed} onChange={(e) => setGoleakConfirmed(e.target.checked)} /> These packages use <code>goleak.VerifyTestMain</code></label>
          )}
          {(criteria.some((c) => c.kind === "github-commit") || verification === "github") && (
            <label className="field">GitHub commit, PR, or release URL
              <input type="url" id={`commit-${task.id}`} value={commitUrl} onChange={(e) => setCommitUrl(e.target.value)} placeholder="https://github.com/you/jobq/commit/…" />
            </label>
          )}
          <ul className="crit">
            {(results.length ? results : criteria.map((c) => ({ criterion: c, ok: false, message: "Waiting for output" }))).map((r, i) => (
              <li key={i} className={results.length ? (r.ok ? "ok" : "no") : ""}>
                <span className="dot" />
                <span><code>{r.criterion.kind}{r.criterion.min ? ` ≥ ${r.criterion.min}%` : ""}</code> {r.message}</span>
              </li>
            ))}
          </ul>
          {report && report.benchmarks.length > 0 && (
            <div className="scroll">
              <table className="data">
                <thead><tr><th>Benchmark</th><th className="num">ns/op</th><th className="num">B/op</th><th className="num">allocs/op</th></tr></thead>
                <tbody>{report.benchmarks.map((b) => <tr key={b.name}><td>{b.name}</td><td className="num">{b.nsPerOp}</td><td className="num">{b.bytesPerOp ?? "–"}</td><td className="num">{b.allocsPerOp ?? "–"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!evidenceNeeded && !reflectGate && (
        <label className="check">
          <input type="checkbox" checked={honor} onChange={(e) => setHonor(e.target.checked)} />
          I did this{task.type === "implement" || task.type === "test" ? " in my jobq repo" : ""}.
        </label>
      )}

      <div className="row">
        <button type="button" className="btn" disabled={!canComplete} onClick={complete}>
          Complete · +{projected} XP
        </button>
        <span className="small muted">~{task.minutes} min{task.bloom ? ` · ${task.bloom}` : ""}</span>
      </div>
    </div>
  );
}
