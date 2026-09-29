// Learning methods. Each one changes the actual flow; `effects` lists how, and the engine and UI
// check `has(settings, id)` at those points. Evidence summaries mirror docs/DESIGN.md §2.

export const METHOD_IDS = [
  "srs",
  "recall",
  "feynman",
  "pomodoro",
  "interleave",
  "project",
  "reflection",
] as const;
export type MethodId = (typeof METHOD_IDS)[number];

export interface MethodDef {
  id: MethodId;
  name: string;
  evidence: string;
  effects: string[];
}

export const METHODS: Record<MethodId, MethodDef> = {
  srs: {
    id: "srs",
    name: "Spaced repetition (FSRS)",
    evidence: "Distributed practice is rated \"high utility\" (Dunlosky et al., 2013). FSRS models memory stability per card.",
    effects: [
      "Finishing a quest's Understand stage creates review cards.",
      "Due cards appear in Daily Orders (capped).",
      "Stat Sharpness shows how much you'd recall right now.",
    ],
  },
  recall: {
    id: "recall",
    name: "Active recall",
    evidence: "Practice testing is rated \"high utility\" (Dunlosky 2013; Roediger & Karpicke 2006).",
    effects: [
      "Read tasks ask you a question before showing the notes.",
      "You self-grade against the model answer before the task completes.",
    ],
  },
  feynman: {
    id: "feynman",
    name: "Feynman technique",
    evidence: "Self-explanation is rated \"moderate utility\" (Bisra et al., 2018 meta-analysis).",
    effects: [
      "The last read task of each quest asks you to explain the idea to a junior in your own words.",
      "The app flags key terms you left out and asks you about them.",
    ],
  },
  pomodoro: {
    id: "pomodoro",
    name: "Pomodoro timeboxing",
    evidence: "Systematic breaks gave the same output in less time, with less fatigue (Biwer et al., 2023).",
    effects: [
      "Implement and test tasks have a focus timer.",
      "XP scales with completed sessions: 50% minimum, 100% at the estimate, +5% per session.",
    ],
  },
  interleave: {
    id: "interleave",
    name: "Interleaving",
    evidence: "Small positive effect; strongest for similar, confusable items (Brunmair & Richter, 2019).",
    effects: [
      "From Phase 3 on, the review order adds a mixed drill from earlier phases.",
      "Confusable topics are pulled in first.",
    ],
  },
  project: {
    id: "project",
    name: "Project-first",
    evidence: "Productive failure: problem solving before instruction helps transfer (Sinha & Kapur, 2021).",
    effects: [
      "Daily Orders lead with the build task instead of reading.",
      "Understand tasks are optional until you've attempted the build.",
    ],
  },
  reflection: {
    id: "reflection",
    name: "Reflection journal",
    evidence: "Reflecting after practice improved later performance (Di Stefano et al., 2014).",
    effects: [
      "Every day has a 3-prompt reflection order.",
      "The daily completion bonus needs the reflection.",
    ],
  },
};

export const BALANCED_PRESET: MethodId[] = ["srs", "recall", "pomodoro", "reflection", "interleave"];

export const has = (methods: readonly MethodId[], id: MethodId) => methods.includes(id);
