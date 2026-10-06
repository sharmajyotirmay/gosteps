"use client";

import { produce } from "immer";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Ctx, rollover, today } from "@/engine/game";
import { initialState, type GameState } from "@/engine/state";
import { dsa, idx } from "@/lib/course";
import { diff, isEmpty, type StorageAdapter } from "@/storage/adapter";
import { LocalAdapter } from "@/storage/local";
import { loadFromDisk, localChangedAt, markLocalChange, probeDisk, saveToDisk } from "@/storage/disk";
import { chime } from "./system/sound";

export type SystemTab = "notices" | "status" | "orders" | "commands";

/** The on-disk mirror (scripts/local-store.ts). "off" means the local store isn't running. */
export interface DiskState {
  status: "checking" | "off" | "ok" | "saving" | "error" | "conflict";
  file: string | null;
  savedAt: string | null;
  error: string | null;
  /** When the file on disk is newer than this browser's data: its save time. Mirroring pauses until resolved. */
  newerOnDisk: string | null;
}

interface DiskApi extends DiskState {
  saveNow: () => Promise<void>;
  loadNow: () => Promise<void>;
  retry: () => Promise<void>;
}

interface GameContextValue {
  state: GameState;
  now: Date;
  act: (fn: (draft: GameState, ctx: Ctx) => void) => void;
  replace: (next: GameState) => Promise<void>;
  system: { open: boolean; tab: SystemTab; show: (tab?: SystemTab) => void; hide: () => void };
  toast: (msg: string) => void;
  disk: DiskApi;
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
  const [disk, setDisk] = useState<DiskState>({ status: "checking", file: null, savedAt: null, error: null, newerOnDisk: null });
  const diskOn = useRef(false);
  const diskTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const flushDisk = useCallback(async () => {
    clearTimeout(diskTimer.current);
    diskTimer.current = undefined;
    const s = stateRef.current;
    if (!diskOn.current || !s) return;
    setDisk((d) => ({ ...d, status: "saving" }));
    try {
      const savedAt = await saveToDisk(s);
      setDisk((d) => ({ ...d, status: "ok", savedAt, error: null }));
    } catch (e) {
      setDisk((d) => ({ ...d, status: "error", error: e instanceof Error ? e.message : "Save failed." }));
    }
  }, []);

  const scheduleDisk = useCallback(() => {
    if (!diskOn.current) return;
    clearTimeout(diskTimer.current);
    diskTimer.current = setTimeout(() => void flushDisk(), 1500);
  }, [flushDisk]);

  const persist = useCallback((prev: GameState | null, next: GameState) => {
    const cs = diff(prev, next);
    if (isEmpty(cs) || !adapterRef.current) return;
    const a = adapterRef.current;
    writeChain.current = writeChain.current.then(() => a.apply(cs)).catch((e) => console.error("save failed", e));
    markLocalChange();
    scheduleDisk();
  }, [scheduleDisk]);

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
    (async () => {
      const loaded = await adapter.load().catch(() => null);
      const info = await probeDisk();
      if (cancelled) return;
      let s = loaded;
      let restored = false;
      let newerOnDisk: string | null = null;

      if (info) {
        if (!loaded) {
          // Fresh or wiped browser: restore from the file on this computer.
          const fromDisk = await loadFromDisk().catch(() => null);
          if (cancelled) return;
          if (fromDisk) {
            s = fromDisk.state;
            await adapter.replaceAll(s);
            restored = true;
          }
        } else if (info.savedAt) {
          const local = localChangedAt();
          if (local && new Date(info.savedAt).getTime() > new Date(local).getTime() + 5000) newerOnDisk = info.savedAt;
        }
        diskOn.current = !newerOnDisk;
        setDisk({ status: newerOnDisk ? "conflict" : "ok", file: info.file, savedAt: info.savedAt, error: null, newerOnDisk });
      } else {
        setDisk({ status: "off", file: null, savedAt: null, error: null, newerOnDisk: null });
      }

      const state0 = s ?? initialState(idx.course.id, new Date());
      stateRef.current = state0;
      setState(state0);
      if (!loaded && !restored) persist(null, state0);
      commit(rollover, new Date());
      if (restored) toast(`Restored your progress from ${info?.file}`);
      if (newerOnDisk) toast("The file on disk is newer than this browser's data. Choose one in Settings → Storage.");
      // First run with the mirror: create the file from what this browser already has.
      if (info && loaded && !info.savedAt) void flushDisk();
    })();

    const tick = () => {
      const t = new Date();
      setNow(t);
      const s = stateRef.current;
      if (s?.player.onboarded && s.player.lastProcessedDay !== today(s, { idx, dsa, now: t, newId })) commit(rollover, t);
    };
    const iv = setInterval(tick, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
      else if (diskTimer.current) void flushDisk(); // leaving the tab: write the pending change now
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [commit, persist, flushDisk, toast]);

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
    markLocalChange();
    scheduleDisk();
    commit(rollover, new Date());
  }, [commit, scheduleDisk]);

  const diskApi: DiskApi = useMemo(
    () => ({
      ...disk,
      // Write this browser's data to the file now (also resolves a conflict in favor of this browser).
      saveNow: async () => {
        diskOn.current = true;
        setDisk((d) => ({ ...d, newerOnDisk: null }));
        await flushDisk();
      },
      // Replace this browser's data with the file's.
      loadNow: async () => {
        const fromDisk = await loadFromDisk().catch(() => null);
        if (!fromDisk) {
          toast("No saved file found on disk.");
          return;
        }
        diskOn.current = false; // don't echo the load back to disk
        await replace(fromDisk.state);
        diskOn.current = true;
        setDisk((d) => ({ ...d, status: "ok", newerOnDisk: null, savedAt: fromDisk.exportedAt }));
        toast("Loaded your progress from disk.");
      },
      retry: async () => {
        const info = await probeDisk();
        if (!info) {
          setDisk((d) => ({ ...d, status: "off" }));
          toast("The local store isn't running. Start it with `pnpm store`.");
          return;
        }
        diskOn.current = true;
        setDisk({ status: "ok", file: info.file, savedAt: info.savedAt, error: null, newerOnDisk: null });
        await flushDisk();
      },
    }),
    [disk, flushDisk, replace, toast],
  );

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
    () => (state ? { state, now, act, replace, system, toast, disk: diskApi } : null),
    [state, now, act, replace, system, toast, diskApi],
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
