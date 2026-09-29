"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markNoticesRead, nextTask, openPenalty, today, spendRestToken } from "@/engine/game";
import { SEVERITIES } from "@/engine/rules";
import type { Notice } from "@/engine/state";
import { idx } from "@/lib/course";
import { useGame, type SystemTab } from "../GameProvider";
import { PlayerCard, StatList, Tokens } from "../ui";
import { OrderList } from "../OrderList";

const TABS: { id: SystemTab; label: string }[] = [
  { id: "notices", label: "Notices" },
  { id: "status", label: "Status" },
  { id: "orders", label: "Orders" },
  { id: "commands", label: "Commands" },
];

/** Reveals text one character at a time, the way a system message "prints". Remount with a key to restart. */
function Typewriter({ text, speed = 28 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), speed);
    return () => clearInterval(iv);
  }, [text, speed]);
  return (
    <span aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      {n < text.length && <span className="type-in" aria-hidden="true">&nbsp;</span>}
    </span>
  );
}

function tone(n: Notice) {
  if (n.kind === "penalty" || n.title.includes("LOST") || n.title.includes("FAILED")) return "danger";
  if (n.kind === "achievement" || n.kind === "boss" || n.kind === "rank") return "gold";
  return "";
}

const STAGE_COMMANDS: Record<string, { label: string; cmd: string }[]> = {
  understand: [{ label: "Read package docs", cmd: "go doc -all <package>" }],
  smallest: [{ label: "Run it", cmd: "go run ./cmd/jobq" }, { label: "Format + vet", cmd: "gofmt -l -w . && go vet ./..." }],
  tests: [{ label: "Run tests", cmd: "go test ./..." }, { label: "Verbose, one test", cmd: "go test -v -run 'TestName' ./..." }],
  concurrency: [{ label: "Run with race detector", cmd: "go test -race ./..." }],
  race: [{ label: "Race-check, 3 runs", cmd: "go test -race -count=3 ./..." }],
  measure: [
    { label: "Coverage", cmd: "go test -cover ./..." },
    { label: "Benchmarks", cmd: "go test -bench=. -benchmem -count=10 -run=^$ ./..." },
  ],
  refactor: [{ label: "Quality gate", cmd: "gofmt -l . && go vet ./... && go test -race ./..." }],
  next: [{ label: "Commit", cmd: "git add -A && git commit -m \"quest: <name>\"" }],
};

export function SystemWindow() {
  const { state, now, act, system, toast } = useGame();
  const [closing, setClosing] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const { open, tab, show, hide } = system;

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      act((d) => markNoticesRead(d));
      setClosing(false);
      hide();
    }, 280);
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const notices = Object.values(state.notices).sort((a, b) => b.at.localeCompare(a.at));
  const featured = notices.find((n) => !n.read && n.important) ?? notices.find((n) => !n.read);
  const rest = notices.filter((n) => n !== featured).slice(0, 25);
  const day = today(state, { idx, now, newId: () => "" });
  const orders = state.orders[day];
  const penalty = openPenalty(state);
  const next = nextTask(state, idx);
  const sev = SEVERITIES[state.settings.severity];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
    if (e.key === "Tab" && frameRef.current) {
      const f = frameRef.current.querySelectorAll<HTMLElement>("button, a, input, [tabindex]:not([tabindex='-1'])");
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const copy = (cmd: string) => {
    navigator.clipboard?.writeText(cmd).then(() => toast("Copied"), () => toast(cmd));
  };

  return (
    <div className={`sys-layer ${closing ? "closing" : ""}`} onKeyDown={onKeyDown}>
      <div className="sys-backdrop" onClick={close} />
      <div className={`sys-frame ${closing ? "closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="sys-title" ref={frameRef}>
        <span className="sys-corner tl" /><span className="sys-corner tr" /><span className="sys-corner bl" /><span className="sys-corner br" />
        <div className="sys-head">
          <div className="sys-title" id="sys-title"><span className="mark" />System</div>
          <button type="button" className="sys-close" onClick={close} ref={closeRef} aria-label="Close the System window">✕</button>
        </div>
        <div className="sys-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => show(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="sys-body" role="tabpanel">
          {tab === "notices" && (
            <>
              {featured ? (
                <div className={`sys-alert ${tone(featured)}`}>
                  <div className="eyebrow">[ Notice ]</div>
                  <div className="big"><Typewriter key={featured.id} text={featured.title} /></div>
                  <p>{featured.body}</p>
                </div>
              ) : (
                <div className="sys-alert"><div className="eyebrow">[ Notice ]</div><p className="muted">No new notices. Keep going.</p></div>
              )}
              {penalty && (
                <div className="gate" style={{ borderColor: "var(--danger)" }}>
                  <h4 style={{ color: "var(--danger)" }}>Penalty Quest open</h4>
                  <div className="small">
                    Reviews {penalty.reviewProgress}/{penalty.reviewTarget}
                    {penalty.taskId && <> · Task: {idx.taskById.get(penalty.taskId)?.title} {penalty.taskDone ? "✓" : ""}</>}
                    {penalty.needsReflection && <> · Reflection {penalty.reflectionDone ? "✓" : ""}</>}
                    {" "}· {state.player.escrowXP} XP held
                  </div>
                </div>
              )}
              {rest.length > 0 && (
                <ul className="sys-list" aria-label="Earlier notices">
                  {rest.map((n) => (
                    <li key={n.id} className={n.read ? "" : "unread"}>
                      <span className="t">{n.title}</span>
                      <span className="b">{n.body}</span>
                      <span className="eyebrow">{new Date(n.at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === "status" && (
            <>
              <PlayerCard state={state} />
              <StatList state={state} now={now} />
              <dl className="kv">
                <dt>Streak</dt><dd>{state.player.metStreak} days (best {state.player.bestStreak})</dd>
                <dt>Rest Tokens</dt><dd><Tokens n={state.player.restTokens} max={sev.maxTokens} /></dd>
                <dt>Mode</dt><dd>{sev.name}</dd>
                <dt>Missed in a row</dt><dd>{state.player.missedStreak}</dd>
                {state.player.rankLock && <><dt>Rank lock</dt><dd>{state.player.rankLock} (Trial pending)</dd></>}
              </dl>
            </>
          )}

          {tab === "orders" && (
            <>
              {orders ? <OrderList orders={orders} onNavigate={close} /> : <p className="muted">No orders yet today.</p>}
              {state.settings.intention && <p className="small muted">Your plan: “{state.settings.intention}”</p>}
            </>
          )}

          {tab === "commands" && (
            <>
              <div className="stack">
                {next && (
                  <div className="sys-cmd">
                    <span>Continue: <b>{next.title}</b></span>
                    <Link className="btn sm" href={`/quests/${next.type === "boss" ? next.id : next.questId}#${next.id}`} onClick={close}>Go</Link>
                  </div>
                )}
                <div className="sys-cmd"><span>Review due cards</span><Link className="btn sm ghost" href="/review" onClick={close}>Review</Link></div>
                <div className="sys-cmd"><span>Write today&apos;s reflection</span><Link className="btn sm ghost" href="/journal" onClick={close}>Journal</Link></div>
                <div className="sys-cmd">
                  <span>Spend a Rest Token on today ({state.player.restTokens} left)</span>
                  <button type="button" className="btn sm ghost" disabled={state.player.restTokens < 1 || Boolean(orders?.tokenUsed)}
                    onClick={() => act((d, c) => { if (!spendRestToken(d, c)) toast("Today is already met or covered"); })}>Rest</button>
                </div>
              </div>
              {next && (
                <div className="stack">
                  <h3 className="ptitle" style={{ margin: "8px 0 0" }}>Go commands · {idx.course.learningRule.find((s) => s.id === next.stage)?.name}</h3>
                  {(STAGE_COMMANDS[next.stage] ?? []).concat(STAGE_COMMANDS.refactor).map((c) => (
                    <div className="sys-cmd" key={c.label + c.cmd}>
                      <span><span className="small muted">{c.label}</span><br /><code>{c.cmd}</code></span>
                      <button type="button" className="btn sm ghost" onClick={() => copy(c.cmd)}>Copy</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="row small muted">
                <span className="kbd">⌘/Ctrl K</span> or <span className="kbd">`</span> toggle the System · <span className="kbd">Esc</span> close
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
