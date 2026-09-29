import { COLLECTIONS, type CollectionName, type GameState, type Player, type Settings } from "@/engine/state";

// The storage boundary. Like the Go roadmap's JobRepository, the app talks only to this
// interface; LocalAdapter (IndexedDB) is the default and remote adapters can slot in later.

export interface ChangeSet {
  player?: Player;
  settings?: Settings;
  put: Partial<Record<CollectionName, { id: string }[]>>;
  del: Partial<Record<CollectionName, string[]>>;
}

export interface ExportBundle {
  app: "gosteps";
  schema: 1;
  exportedAt: string;
  state: GameState;
}

export interface StorageAdapter {
  readonly id: "local" | "supabase" | "pocketbase" | "postgres-api";
  load(): Promise<GameState | null>;
  apply(changes: ChangeSet): Promise<void>;
  replaceAll(state: GameState): Promise<void>;
  clear(): Promise<void>;
}

/** Collect what changed between two immutable snapshots, by reference. */
export function diff(prev: GameState | null, next: GameState): ChangeSet {
  const cs: ChangeSet = { put: {}, del: {} };
  if (!prev || prev.player !== next.player) cs.player = next.player;
  if (!prev || prev.settings !== next.settings) cs.settings = next.settings;
  for (const c of COLLECTIONS) {
    const a = prev?.[c] ?? {};
    const b = next[c];
    if (a === b) continue;
    const put = Object.values(b).filter((v) => a[v.id as keyof typeof a] !== v);
    const del = Object.keys(a).filter((k) => !(k in b));
    if (put.length) cs.put[c] = put;
    if (del.length) cs.del[c] = del;
  }
  return cs;
}

export const isEmpty = (cs: ChangeSet) =>
  !cs.player && !cs.settings && Object.keys(cs.put).length === 0 && Object.keys(cs.del).length === 0;

export function makeBundle(state: GameState, now: Date): ExportBundle {
  return { app: "gosteps", schema: 1, exportedAt: now.toISOString(), state };
}

/** Validate an imported bundle enough to trust its shape. */
export function readBundle(raw: unknown): GameState {
  const b = raw as Partial<ExportBundle>;
  if (!b || b.app !== "gosteps" || b.schema !== 1 || !b.state) throw new Error("This isn't a GoSteps backup file.");
  const s = b.state as GameState;
  if (!s.player || !s.settings) throw new Error("The backup is missing player or settings data.");
  for (const c of COLLECTIONS) if (typeof s[c] !== "object" || s[c] === null) s[c] = {} as never;
  return s;
}
