"use client";

import { useEffect, useRef, useState } from "react";
import { completedSessions, recordSession } from "@/engine/game";
import { useGame } from "./GameProvider";
import { chime } from "./system/sound";

type Phase = "idle" | "work" | "break";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function PomodoroTimer({ taskId, estimate }: { taskId: string; estimate: number }) {
  const { state, act, toast } = useGame();
  const [phase, setPhase] = useState<Phase>("idle");
  const [endsAt, setEndsAt] = useState(0);
  const [left, setLeft] = useState(0);
  const startedAt = useRef<Date | null>(null);
  const done = completedSessions(state, taskId);
  const { pomodoroWork, pomodoroBreak, sound } = state.settings;

  useEffect(() => {
    if (phase === "idle") return;
    const iv = setInterval(() => {
      const remaining = endsAt - Date.now();
      setLeft(remaining);
      if (remaining > 0) return;
      if (phase === "work") {
        const start = startedAt.current ?? new Date();
        act((d, c) => recordSession(d, c, taskId, start, true));
        if (sound) chime("up");
        toast("Focus session complete. Take a break.");
        setPhase("break");
        setEndsAt(Date.now() + pomodoroBreak * 60_000);
      } else {
        if (sound) chime("open");
        setPhase("idle");
      }
    }, 500);
    return () => clearInterval(iv);
  }, [phase, endsAt, act, taskId, pomodoroBreak, sound, toast]);

  const start = () => {
    startedAt.current = new Date();
    const end = Date.now() + pomodoroWork * 60_000;
    setEndsAt(end);
    setLeft(end - Date.now());
    setPhase("work");
  };
  const abandon = () => {
    if (phase === "work" && startedAt.current) {
      const s = startedAt.current;
      act((d, c) => recordSession(d, c, taskId, s, false));
    }
    setPhase("idle");
  };

  return (
    <div className="gate">
      <h4>Focus timer</h4>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="timer" aria-live="off">{phase === "idle" ? fmt(pomodoroWork * 60_000) : fmt(left)}</span>
        <span className="chip"><b>{done}</b> / {estimate} sessions</span>
      </div>
      <div className="row">
        {phase === "idle" ? (
          <button type="button" className="btn sm" onClick={start}>Start {pomodoroWork}-min session</button>
        ) : (
          <>
            <span className="chip">{phase === "work" ? "Focus" : "Break"}</span>
            <button type="button" className="btn sm ghost" onClick={abandon}>{phase === "work" ? "Abandon" : "Skip break"}</button>
          </>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>XP scales with completed sessions: 50% minimum, full at the estimate, +5% for each session.</p>
    </div>
  );
}
