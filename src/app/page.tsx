"use client";

import Link from "next/link";
import { OrderList } from "@/components/OrderList";
import { useGame } from "@/components/GameProvider";
import { Panel, PlayerCard, StatList, Tokens } from "@/components/ui";
import { isMet, nextTask, openPenalty, today } from "@/engine/game";
import { STAGES } from "@/engine/course";
import { SEVERITIES, rankDef, RANKS, rankIndex } from "@/engine/rules";
import { idx } from "@/lib/course";

export default function Dashboard() {
  const { state, now } = useGame();
  const day = today(state, { idx, now, newId: () => "" });
  const orders = state.orders[day];
  const penalty = openPenalty(state);
  const next = nextTask(state, idx);
  const quest = next && next.type !== "boss" ? idx.questById.get(next.questId) : undefined;
  const sev = SEVERITIES[state.settings.severity];
  const nextRank = RANKS[rankIndex(state.player.rank) + 1];

  const stageState = (st: (typeof STAGES)[number]) => {
    if (!quest) return "";
    const ts = quest.tasks.filter((t) => t.stage === st);
    if (!ts.length) return "skip";
    if (ts.every((t) => state.progress[t.id])) return "done";
    return next?.stage === st ? "now" : "";
  };

  return (
    <>
      {penalty ? (
        <section className="panel notice penalty">
          <span className="tag">PENALTY</span>
          <div>
            <div className="who">The Registry</div>
            <p>
              Penalty Quest open. Clear {penalty.reviewTarget ? `${penalty.reviewTarget} reviews (${penalty.reviewProgress} done)` : ""}
              {penalty.reviewTarget && penalty.taskId ? " and " : ""}
              {penalty.taskId ? `"${idx.taskById.get(penalty.taskId)?.title}"` : ""}
              {penalty.needsReflection ? "a reflection in the Journal" : ""}. {state.player.escrowXP} XP is held until then.
              {new Date(penalty.deadline) > now ? ` Clear it by ${new Date(penalty.deadline).toLocaleString()} to repair your streak.` : ""}
            </p>
          </div>
        </section>
      ) : (
        <section className="panel notice">
          <span className="tag">NOTICE</span>
          <div>
            <div className="who">The Registry</div>
            <p>
              {orders && isMet(orders) ? "Today's orders are met. Anything more is a bonus." : "Daily Orders issued."}
              {state.settings.intention && <> Your plan: <em>&ldquo;{state.settings.intention}&rdquo;</em></>}
            </p>
          </div>
        </section>
      )}

      <div className="grid-2">
        <aside className="col">
          <Panel title="Status">
            <PlayerCard state={state} />
            {nextRank && (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Next rank {nextRank.id}: level {nextRank.minLevel}
                {nextRank.bossPhase ? ` + Phase ${nextRank.bossPhase} Gate Trial` : ""}
                {nextRank.id === "Ω" ? " + 90% of cards with 30-day stability" : ""}
              </p>
            )}
          </Panel>
          <Panel title="Stats">
            <StatList state={state} now={now} />
            <p className="small muted" style={{ marginBottom: 0 }}>The bar under each stat shows Sharpness: how much of that stat&apos;s cards you&apos;d recall right now.</p>
          </Panel>
          <Panel title="Safeguards">
            <dl className="kv">
              <dt>Rest Tokens</dt><dd><Tokens n={state.player.restTokens} max={sev.maxTokens} /></dd>
              <dt>Streak</dt><dd>{state.player.metStreak} d</dd>
              <dt>Mode</dt><dd>{sev.name} · grace {sev.grace}</dd>
              <dt>Rank floor</dt><dd>{rankDef(state.player.rank).minLevel > 1 ? `LV ${rankDef(state.player.rank).minLevel}` : "none"}</dd>
              <dt>Stasis</dt><dd>{state.player.stasis ? "Active" : "Available"}</dd>
            </dl>
          </Panel>
        </aside>

        <div className="col">
          <Panel title="Daily Orders">
            {orders ? <OrderList orders={orders} /> : <p className="muted">Orders arrive after the day boundary.</p>}
            {orders && (
              <div className="row small muted" style={{ marginTop: 12, justifyContent: "space-between" }}>
                <span>{isMet(orders) ? "Day met ✓" : "To meet the day: one build or read order, plus 80% of reviews."}</span>
                <span>{orders.bonusGranted ? "Completion bonus earned" : "Clear all for +20%"}</span>
              </div>
            )}
          </Panel>

          {next && (
            <Panel title={next.type === "boss" ? "Gate Trial" : "Current Quest"}>
              {quest ? (
                <div className="stack">
                  <div className="row" style={{ alignItems: "baseline" }}>
                    <span className="eyebrow">Phase {idx.phaseById.get(quest.phaseId)!.index} · Quest {quest.index}</span>
                    <h3 style={{ margin: 0, font: "600 20px/1.2 var(--display)" }}>{quest.title}</h3>
                  </div>
                  <p className="muted small" style={{ margin: 0 }}>{quest.goal}</p>
                  <ol className="steps" aria-label="Learning Rule stages">
                    {idx.course.learningRule.map((s) => (
                      <li key={s.id} className={stageState(s.id)} aria-current={stageState(s.id) === "now" ? "step" : undefined}>{s.name}</li>
                    ))}
                  </ol>
                  <div><Link className="btn" href={`/quests/${quest.id}#${next.id}`}>Continue: {next.title}</Link></div>
                </div>
              ) : (
                <div className="stack">
                  <h3 style={{ margin: 0, font: "600 20px/1.2 var(--display)" }}>{next.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>All quests in this phase are done. Clear the Gate Trial with evidence to unlock the next rank.</p>
                  <div><Link className="btn" href={`/quests/${next.id}`}>Enter the Gate</Link></div>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
