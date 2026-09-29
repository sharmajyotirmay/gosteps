import Dexie, { type Table } from "dexie";
import { COLLECTIONS, type CollectionName, type GameState } from "@/engine/state";
import type { ChangeSet, StorageAdapter } from "./adapter";

// IndexedDB via Dexie. One table per collection plus a `meta` table for the player and settings.

type Row = { id: string };

class GoStepsDB extends Dexie {
  meta!: Table<Row & Record<string, unknown>, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      meta: "id",
      progress: "id, questId, day",
      cards: "id, questId, fsrs.due",
      reviews: "id, cardId, day",
      orders: "id",
      penalties: "id",
      log: "id, at, day, kind",
      notices: "id, at",
      reflections: "id, day",
      sessions: "id, taskId",
      attempts: "id, taskId",
      achievements: "id",
    });
  }
  col(name: CollectionName): Table<Row, string> {
    return this.table(name);
  }
}

export class LocalAdapter implements StorageAdapter {
  readonly id = "local" as const;
  private db: GoStepsDB;

  constructor(name = "gosteps") {
    this.db = new GoStepsDB(name);
  }

  async load(): Promise<GameState | null> {
    const player = await this.db.meta.get("player");
    const settings = await this.db.meta.get("settings");
    if (!player || !settings) return null;
    const state = { player, settings } as unknown as GameState;
    for (const c of COLLECTIONS) {
      const rows = await this.db.col(c).toArray();
      (state as unknown as Record<string, unknown>)[c] = Object.fromEntries(rows.map((r) => [r.id, r]));
    }
    return state;
  }

  async apply(cs: ChangeSet): Promise<void> {
    const tables = [this.db.meta, ...COLLECTIONS.map((c) => this.db.col(c))];
    await this.db.transaction("rw", tables, async () => {
      if (cs.player) await this.db.meta.put(cs.player as never);
      if (cs.settings) await this.db.meta.put(cs.settings as never);
      for (const [c, rows] of Object.entries(cs.put)) await this.db.col(c as CollectionName).bulkPut(rows);
      for (const [c, ids] of Object.entries(cs.del)) await this.db.col(c as CollectionName).bulkDelete(ids);
    });
  }

  async replaceAll(state: GameState): Promise<void> {
    await this.clear();
    await this.apply({
      player: state.player,
      settings: state.settings,
      put: Object.fromEntries(COLLECTIONS.map((c) => [c, Object.values(state[c])])),
      del: {},
    });
  }

  async clear(): Promise<void> {
    await Promise.all([this.db.meta.clear(), ...COLLECTIONS.map((c) => this.db.col(c).clear())]);
  }
}
