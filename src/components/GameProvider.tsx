"use client";

import { produce } from "immer";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Ctx, rollover, today } from "@/engine/game";
import { initialState, type GameState } from "@/engine/state";
import { dsa, idx } from "@/lib/course";
import { diff, isEmpty, type StorageAdapter } from "@/storage/adapter";
import { LocalAdapter } from "@/storage/local";
import { chime } from "./system/sound";

export type SystemTab = "notices" | "status" | "orders" | "commands";

interface GameContextValue {
  state: GameState;
  now: Date;
  act: (fn: (draft: GameState, ctx: Ctx) => void) => void;
  replace: (next: GameState) => Promise<void>;
  system: { open: boolean; tab: SystemTab; show: (tab?: SystemTab) => void; hide: () => void };
  toast: (msg: string) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame() {
  const v = useContext(GameContext);
  if (!v) throw new Error("useGame outside GameProvider");
  return v;
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [sysOpen, setSysOpen] = useState(false);
  const [sysTab, setSysTab] = useState<SystemTab>("notices");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const stateRef = useRef<GameState | null>(null);
  const adapterRef = useRef<StorageAdapter | null>(null);
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = useCallback((prev: GameState | null, next: GameState) => {
    const cs = diff(prev, next);
    if (isEmpty(cs) || !adapterRef.current) return;
    const a = adapterRef.current;
    writeChain.current = writeChain.current.then(() => a.apply(cs)).catch((e) => console.error("save failed", e));
  }, []);

  const commit = useCallback(
    (fn: (draft: GameState, ctx: Ctx) => void, at: Date) => {
      const prev = stateRef.current;
      if (!prev) return;
      const next = produce(prev, (d) => fn(d, { idx, dsa, now: at, newId }));
      if (next === prev) return;
      stateRef.current = next;
      setState(next);
      persist(prev, next);
      // Pop the System window when something important just happened.
      const before = new Set(Object.keys(prev.notices));
      const fresh = Object.values(next.notices).filter((n) => !before.has(n.id) && n.important && !n.read);
      if (fresh.length && !next.settings.quietMode) {
        setSysTab("notices");
        setSysOpen(true);
        if (next.settings.sound) chime(fresh.some((n) => n.kind === "penalty" || (n.kind === "rank" && n.title.includes("LOST"))) ? "warn" : "up");
      }
    },
    [persist],
  );

  const act = useCallback((fn: (draft: GameState, ctx: Ctx) => void) => commit(fn, new Date()), [commit]);

  // Load once, then keep the clock and the day rollover ticking.
  useEffect(() => {
    let cancelled = false;
    const adapter = new LocalAdapter();
    adapterRef.current = adapter;
    navigator.storage?.persist?.().catch(() => {});
    adapter
      .load()
      .catch(() => null)
      .then((loaded) => {
        if (cancelled) return;
        const s = loaded ?? initialState(idx.course.id, new Date());
        stateRef.current = s;
        setState(s);
        if (!loaded) persist(null, s);
        commit(rollover, new Date());
      });

    const tick = () => {
      const t = new Date();
      setNow(t);
      const s = stateRef.current;
      if (s?.player.onboarded && s.player.lastProcessedDay !== today(s, { idx, dsa, now: t, newId })) commit(rollover, t);
    };
    const iv = setInterval(tick, 30_000);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [commit, persist]);

  // Theme is a DOM attribute, not React state.
  const theme = state?.settings.theme;
  useEffect(() => {
    const el = document.documentElement;
    if (!theme || theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);

  const replace = useCallback(async (next: GameState) => {
    const a = adapterRef.current;
    if (a) await a.replaceAll(next);
    stateRef.current = next;
    setState(next);
    commit(rollover, new Date());
  }, [commit]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const soundOn = state?.settings.sound ?? false;
  const system = useMemo(
    () => ({
      open: sysOpen,
      tab: sysTab,
      show: (tab?: SystemTab) => {
        if (tab) setSysTab(tab);
        setSysOpen(true);
        if (soundOn) chime("open");
      },
      hide: () => setSysOpen(false),
    }),
    [sysOpen, sysTab, soundOn],
  );

  const value = useMemo(
    () => (state ? { state, now, act, replace, system, toast } : null),
    [state, now, act, replace, system, toast],
  );

  if (!value) return <div className="skeleton">INITIALIZING SYSTEM…</div>;
  return (
    <GameContext.Provider value={value}>
      {children}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </GameContext.Provider>
  );
}
