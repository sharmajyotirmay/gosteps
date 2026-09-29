// A short synthesized chime for System notices. No audio files, nothing leaves the device.

let ctx: AudioContext | null = null;

export function chime(kind: "open" | "up" | "warn") {
  try {
    ctx ??= new AudioContext();
    const notes = kind === "warn" ? [392, 330] : kind === "up" ? [660, 880, 1320] : [880, 1320];
    const t0 = ctx.currentTime;
    notes.forEach((f, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = kind === "warn" ? "square" : "sine";
      osc.frequency.value = f;
      const start = t0 + i * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(kind === "warn" ? 0.04 : 0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // Audio is optional.
  }
}
