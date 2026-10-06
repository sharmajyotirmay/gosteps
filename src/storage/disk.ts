import type { GameState } from "@/engine/state";
import { makeBundle, readBundle, type ExportBundle } from "./adapter";

// Client for the local file store (scripts/local-store.ts). It's optional: when the store
// isn't running (a deployed site, or `next dev` on its own) every call fails quietly.

export const DEFAULT_STORE_URL = process.env.NEXT_PUBLIC_GOSTEPS_STORE ?? "http://127.0.0.1:4777";

/** A per-browser override (localStorage "gosteps.storeUrl") wins, e.g. so tests never touch your real data. */
export function storeUrl(): string {
  try {
    return localStorage.getItem("gosteps.storeUrl") || DEFAULT_STORE_URL;
  } catch {
    return DEFAULT_STORE_URL;
  }
}

export interface DiskInfo {
  dir: string;
  file: string;
  savedAt: string | null;
}

async function call(path: string, init?: RequestInit, timeoutMs = 1500): Promise<Response | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${storeUrl()}${path}`, { ...init, signal: ctl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function probeDisk(): Promise<DiskInfo | null> {
  const r = await call("/health", undefined, 800);
  if (!r?.ok) return null;
  const j = (await r.json()) as DiskInfo & { ok: boolean };
  return { dir: j.dir, file: j.file, savedAt: j.savedAt };
}

export async function loadFromDisk(): Promise<{ state: GameState; exportedAt: string } | null> {
  const r = await call("/state", undefined, 5000);
  if (!r?.ok) return null;
  const bundle = (await r.json()) as ExportBundle;
  return { state: readBundle(bundle), exportedAt: bundle.exportedAt };
}

/** Returns the save time, or throws if the store rejected the write. */
export async function saveToDisk(state: GameState, now = new Date()): Promise<string> {
  const r = await call("/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(makeBundle(state, now)) }, 10_000);
  if (!r) throw new Error("The local store isn't running.");
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Save failed (${r.status}).`);
  return ((await r.json()) as { savedAt: string }).savedAt;
}

// When this browser last changed its data, so we can tell whether the file on disk is newer.
const CHANGED_KEY = "gosteps.localChangedAt";

export function markLocalChange(at = new Date()) {
  try {
    localStorage.setItem(CHANGED_KEY, at.toISOString());
  } catch {
    // Storage can be blocked; the mirror still works, we just can't compare ages.
  }
}

export function localChangedAt(): string | null {
  try {
    return localStorage.getItem(CHANGED_KEY);
  } catch {
    return null;
  }
}
