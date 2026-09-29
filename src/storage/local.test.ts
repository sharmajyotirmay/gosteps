import "fake-indexeddb/auto";
import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { initialState } from "@/engine/state";
import { diff, makeBundle, readBundle } from "./adapter";
import { LocalAdapter } from "./local";

describe("LocalAdapter", () => {
  it("persists only changed records and round-trips", async () => {
    const a = new LocalAdapter("test-" + Math.random());
    const s0 = initialState("go", new Date("2026-10-01T10:00:00Z"));
    await a.apply(diff(null, s0));

    const s1 = produce(s0, (d) => {
      d.player.xp = 42;
      d.log.a = { id: "a", at: "x", day: "2026-10-01", kind: "xp", delta: 42, balance: 42, reason: "test" };
    });
    const cs = diff(s0, s1);
    expect(cs.player?.xp).toBe(42);
    expect(cs.settings).toBeUndefined();
    expect(cs.put.log).toHaveLength(1);
    expect(cs.put.cards).toBeUndefined();
    await a.apply(cs);

    const loaded = await a.load();
    expect(loaded?.player.xp).toBe(42);
    expect(loaded?.log.a.reason).toBe("test");
  });

  it("export bundles validate on import", () => {
    const s = initialState("go", new Date());
    const back = readBundle(JSON.parse(JSON.stringify(makeBundle(s, new Date()))));
    expect(back.player.courseId).toBe("go");
    expect(() => readBundle({ nope: true })).toThrow();
  });
});
