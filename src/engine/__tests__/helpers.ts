import { produce } from "immer";
import { buildCourse } from "../../../scripts/build-course";
import { indexCourse } from "../course";
import { buildDsa } from "../../../scripts/build-dsa";
import { indexDsa } from "../dsa-track";
import type { Ctx } from "../game";
import { onboard } from "../game";
import { initialState, type GameState } from "../state";
import { join } from "node:path";

export const idx = indexCourse(buildCourse(join(__dirname, "../../../curriculum/go")));
export const dsa = indexDsa(buildDsa(join(__dirname, "../../../curriculum/dsa")));

// Module-level so ids stay unique across separate actions in one test.
let n = 0;

export function makeCtx(now: Date): Ctx {
  return { idx, dsa, now, newId: () => `id${++n}` };
}

export function at(iso: string) {
  return new Date(iso);
}

export function fresh(now: Date, overrides: Partial<GameState["settings"]> = {}): GameState {
  const s = initialState("go", now);
  return produce(s, (d) => {
    Object.assign(d.settings, overrides);
    onboard(d, makeCtx(now), {
      name: "Tester",
      methods: overrides.methods ?? d.settings.methods,
      severity: overrides.severity ?? "standard",
      intention: "",
      dayBoundaryHour: 4,
    });
  });
}

export function act(s: GameState, now: Date, fn: (d: GameState, ctx: Ctx) => void): GameState {
  const ctx = makeCtx(now);
  return produce(s, (d) => fn(d, ctx));
}
