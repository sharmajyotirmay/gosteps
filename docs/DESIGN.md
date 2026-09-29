# GoSteps — Design Document (Step 1)

> Status: **Implemented (M1–M4).** This document describes the built system. Where the build changed the original draft, the change is noted inline.
> Scope: a local-first, leveling-style study app. It turns any curriculum into daily quests, XP, ranks, and stats. The first course is a Go roadmap where the learner builds a concurrent job-processing system (9 phases, 35 sections).

---

## 0. Naming and IP

Everything here is original. The app is **GoSteps**, and its in-app narrator is **the Registry**. The Registry is the "system" voice that issues quests, notices, and penalties. We use no character names, logos, art, catch-phrases, or quotes from any manhwa, webtoon, or game.

| Concept | Our term |
|---|---|
| The system voice | **The Registry** |
| Daily quest set | **Daily Orders** |
| Catch-up task after a miss | **Penalty Quest** ("Recovery Order") |
| Phase capstone | **Boss Quest** ("Gate Trial") |
| Ranks | **E → D → C → B → A → S**, plus an optional higher tier: **Ascendant (Ω)** |
| Rest day | **Rest Token** |
| Vacation mode | **Stasis** |

Letter-grade ranks are a generic game convention and aren't owned by any franchise.

---

## 1. Research summary: gamification in learning

### 1.1 What the evidence says works

- **Gamification has a small, real effect on learning.** A meta-analysis found significant small effects on cognitive (g = 0.49), motivational (g = 0.36), and behavioral (g = 0.25) outcomes. Only the cognitive effect held up in the high-rigor subset. [Sailer & Homner, 2020][sailer]
- **The effect comes from the underlying learning techniques, not the points.** Dunlosky et al.'s review of 10 techniques rated only **practice testing** and **distributed practice** as "high utility." Interleaving and self-explanation were rated "moderate." Highlighting and rereading were rated "low." [Dunlosky et al., 2013][dunlosky]
  - **Design consequence:** XP must be paid for high-utility behaviors (retrieval, spacing, building and testing code), not for time spent or pages read.
- **Points, levels, and leaderboards raise performance on the rewarded task but not intrinsic motivation.** [Mekler et al., 2017][mekler]
- **Streaks motivate while they're intact.** Showing an intact streak increases engagement compared with showing a broken one. The drop after a break is larger when people blame themselves, and it shrinks when the streak can be **repaired**. [Silverman & Barasch, 2023][streaks]
- **"Fresh start" moments renew goal pursuit.** Examples are a new week or a new level. [Dai, Milkman & Riis, 2014][freshstart] We use these for recovery after rank loss.

### 1.2 Known risks and how the design mitigates them

| Risk | Evidence | Mitigation in GoSteps |
|---|---|---|
| **Overjustification effect.** Expected, tangible rewards for an activity someone already enjoys can reduce intrinsic motivation. | Lepper, Greene & Nisbett 1973; meta-analysis by [Deci, Koestner & Ryan 1999][deci]. Expected, task-contingent rewards were the most harmful. | (1) XP feedback is **informational**: it shows *what you can now do* ("Concurrency +3: you can now bound a worker pool"), not just a number. (2) Surprise achievements are unexpected, which the meta-analysis found harmless. (3) Stats reflect measured competence (test pass rates, card retention), not grind. (4) An **"Quiet mode"** setting hides XP pop-ups for learners who find them distracting. |
| **Gamification can wear off or backfire over time.** | In a 16-week study, a gamified course with badges and a leaderboard showed *declining* intrinsic motivation, satisfaction, and exam scores compared with the non-gamified course. [Hanus & Fox, 2015][hanus] | No leaderboards and no social comparison. The app is solo only. The only rival is your past self: weekly "Then vs Now" cards. |
| **Streak anxiety and loss aversion.** | Losses weigh more than equal gains (Kahneman & Tversky 1979). Broken streaks demotivate, especially when self-attributed. [Silverman & Barasch, 2023][streaks] | Grace days, Rest Tokens, and **streak repair**. A missed day can be repaired by clearing the Penalty Quest within 48 h, so the log shows "repaired," not "broken." Stasis (vacation) freezes everything. Missed-day notices use neutral wording and never shame. |
| **Punishment-driven dropout.** Harsh loss mechanics lead people to quit instead of re-engaging, the "what-the-hell" effect. | Self-Determination Theory: control-oriented pressure undermines autonomy. [Ryan & Deci, 2000][sdt] | (1) The learner chooses severity (Gentle, Standard, or Hardcore). Gentle has no XP decay at all. (2) Penalty XP is **held in escrow**, not destroyed. You keep earning, but the XP unlocks only after the Penalty Quest is cleared. (3) Decay has a floor at the start of your current rank. Demotion happens only after a long, explicit warning period. (4) Every demotion comes with a "Re-Ascension Trial" that restores the rank in one session. This is a fresh-start mechanic. |
| **Gaming the system.** Clicking checkboxes for XP. | — | Verification multipliers pay more for evidence (parsed `go test` output) and GitHub commits. Boss Quests *require* evidence. Honor-system XP is never zero, so learners who choose it aren't punished. |
| **Busywork displacing learning.** | Dunlosky 2013: low-utility techniques feel productive. | `read` tasks give the least XP and are capped per day. Retrieval, implementation, and tests give the most. |

---

## 2. Learning methods

Every method is a **plugin** that implements the same interface (§4.3). Methods are combinable. The selected methods change the actual flow: which tasks appear, what gates completion, and how XP is calculated.

| Method | Evidence | How it changes the flow | Data needed |
|---|---|---|---|
| **Spaced repetition (FSRS; SM-2 fallback)** | Distributed practice is "high utility" [Dunlosky 2013][dunlosky]. Spacing meta-analysis: [Cepeda et al., 2006][cepeda]. FSRS models Difficulty, Stability, and Retrievability, and ships in Anki ≥ 23.10. [FSRS][fsrs] | When a Task marked `concept` is completed, it generates 1–3 **Cards**. Due cards are added to Daily Orders (capped, default 15). The Review screen rates each card Again / Hard / Good / Easy, then reschedules it with `ts-fsrs`. Each stat's **Sharpness** is the mean retrievability of that stat's cards. | Card, ReviewLog (rating, elapsed days, stability, difficulty) |
| **Active recall / retrieval practice** | Practice testing is "high utility" [Dunlosky 2013][dunlosky]. Testing effect: [Roediger & Karpicke, 2006][roediger]. Meta-analysis: [Adesope et al., 2017][adesope] | A `read` task hides its notes until the learner writes an answer to a **pre-question**. Before a quest can move from Understand to Implement, the learner must pass a short **gate quiz** (default ≥ 2 of 3). Answers are self-graded against a model answer. | Quiz items per task, Attempt.answer |
| **Feynman technique** | Closely related to self-explanation, which Dunlosky rated "moderate." Meta-analysis of self-explanation: [Bisra et al., 2018][bisra]. Learning by teaching: Fiorella & Mayer 2013. | Adds a **"Explain it to a junior"** step after Understand. The learner writes ≤ 150 words. The app checks the text for each of the task's `keyTerms` and for jargon without a definition, then asks a follow-up about each gap, e.g. "You didn't mention *who closes the channel*." No LLM is needed; this is keyword and heuristic checking. | Task.keyTerms, Attempt.explanation |
| **Pomodoro / timeboxing** | Systematic breaks (e.g., 24 min of work, then a 6 min break) gave task completion equal to self-regulated breaks in less time, with less fatigue and higher motivation. [Biwer et al., 2023][biwer]. The evidence is on mood and efficiency, not retention. | Tasks run inside a focus timer. Work and break lengths are configurable, default 25/5. XP for `implement` and `test` tasks is tied to completed sessions: `base × max(0.5, min(1, sessions / estSessions))`, plus 5% per completed session. The 0.5 floor was added during the build so that skipping the timer isn't punished to zero. An abandoned session counts toward nothing and costs nothing. | FocusSession (start, end, completed, taskId) |
| **Interleaving** | Small positive effect overall, with strong moderators. It works best when the items are similar but need to be discriminated. [Brunmair & Richter, 2019][interleave] | The Daily Orders generator draws review and practice items from **≥ 2 phases** once the learner is past Phase 2. It favors *confusable* pairs using a `confusableWith` map, e.g. `sync.Mutex` vs channels, or `context` cancellation vs `select` with `time.After`. It never interleaves *new* material. | Task.confusableWith, phase tags |
| **Project-based / deliberate practice** | Deliberate practice (Ericsson et al., 1993) has a real but smaller effect than first claimed [Macnamara et al., 2014][macnamara]. Productive failure: [Sinha & Kapur, 2021][kapur] | Reorders each quest to **Implement → hit a wall → pull in theory**. The Understand stage is locked until the learner makes one implementation attempt or presses "I'm stuck." Theory tasks become "on demand." Each quest gets a **feedback target**: the specific test that must pass. | Stage ordering override, Task.feedbackTarget |
| **Bloom's taxonomy progression** | Revised taxonomy: Anderson & Krathwohl, 2001. This is a *design scaffold*, not an intervention with an effect size. | Each concept has a Bloom level: Remember → Understand → Apply → Analyze → Evaluate → Create. A concept's cards and tasks unlock the next level only after the current one is passed. Stats show a Bloom "depth" bar per concept. | Task.bloom, ConceptProgress.level |
| **Reflection journaling / rubber duck** | Reflection after practice improved later performance. [Di Stefano et al., 2014][reflect]. Rubber-duck debugging comes from Hunt & Thomas 1999 (practitioner folklore). | XP from a session is **held** until a 3-prompt reflection is written: *What did I build? What surprised me? What will I do differently?* Reflections are searchable in the Journal. | Reflection (sessionId, prompts, text) |
| **Worked-example → faded practice** *(added)* | Worked-example effect (Sweller; Renkl): strong for novices, reverses for experts. | Early tasks in each phase show a full solution, then a partially blanked solution, then a blank editor. The fading speeds up as the phase's stat grows. | Task.workedExample, fadeLevel |
| **Implementation intentions** *(added)* | Meta-analysis d ≈ 0.65 on goal attainment. [Gollwitzer & Sheeran, 2006][gollwitzer] | During onboarding and weekly, the learner writes: "When [time/place], I will [first action]." The dashboard shows this plan in the Daily Orders header. | Settings.intentions |

**Default preset: "Balanced."** Spaced repetition + active recall + Pomodoro + reflection. Interleaving switches on automatically after Phase 2.

---

## 3. XP, rank, and decay formulas

### 3.1 Task XP

```
xp = base(type) × phaseMult × verifyMult × methodMult
     (+ first-try bonus, + daily completion bonus)

base:        read 10 · reflect 15 · review 3/card · test 25 · implement 30 · boss 250
phaseMult:   1 + 0.15 × (phaseIndex − 1)        # Phase 1 = 1.00, Phase 9 = 2.20
verifyMult:  honor 1.00 · evidence 1.25 · github 1.40
methodMult:  Pomodoro: max(0.5, min(1, sessions/estSessions)) + 0.05 × sessions
             Others: 1.00 (they change gates and flow, not payout)
dailyBonus:  +20% of the day's Daily Orders XP if every order is cleared
readCap:     at most 3 `read` tasks pay XP per day
```

**Worked example.** Phase 3, `implement` a bounded worker pool, evidence verified, Pomodoro with 2 of 2 estimated sessions:
`30 × 1.30 × 1.25 × (1 + 0.10) = 53.6 → 54 XP`.

### 3.2 Levels

The curve is linear, so progress stays visible. It's calibrated so that finishing the course lands around level 38–42.

```
xpToNext(L)      = 50 + 25 × L
cumulativeXP(L)  = 50(L−1) + 12.5 × L × (L−1)
```

| Level | XP to next | Cumulative |
|---|---|---|
| 1 | 75 | 0 |
| 5 | 175 | 450 |
| 10 | 300 | 1,575 |
| 20 | 550 | 5,700 |
| 30 | 800 | 12,325 |
| 40 | 1,050 | 21,450 |

Budget check: 35 quests × ~8 tasks × ~22 XP × ~1.6 average multiplier ≈ 9.9k. Add 9 bosses × ~450 ≈ 4k, plus ~120 days of dailies and reviews ≈ 7k. Total ≈ 21k, which is about level 40. ✔

### 3.3 Ranks

A rank requires **both** a minimum level and a cleared Boss Quest. This means grinding reviews alone can't buy a rank.

| Rank | Min level | Required boss |
|---|---|---|
| E | 1 | — |
| D | 6 | Phase 1 |
| C | 14 | Phase 3 |
| B | 22 | Phase 5 |
| A | 30 | Phase 7 |
| S | 38 | Phase 9 |
| Ω Ascendant *(optional)* | S | Course done **and** ≥ 90% of cards have stability ≥ 30 days |

### 3.4 Stats

There are six default stats. The course JSON can rename them or add more.

| Stat | Covers |
|---|---|
| Fundamentals (FND) | Language core |
| Concurrency (CON) | Goroutines, channels, sync |
| Reliability (REL) | Errors, retries, context |
| Testing (TST) | Tests, the race detector, benchmarks |
| Systems (SYS) | Design, persistence, observability |
| Deployment (DEP) | Build, containers, CI |

Each task has `stats: { CON: 0.7, TST: 0.3 }`. After a task is completed, `statXP += xp × weight`. The displayed stat value is `floor(sqrt(statXP))`.

Each stat also has a **Sharpness** value from 0–100%: the mean FSRS retrievability of that stat's cards, *right now*. This is the honest version of "decay": the numbers track real forgetting, not arbitrary punishment.

### 3.5 Days, penalties, escrow, and decay

- **Day boundary:** the learner's local time, default **04:00**, so late-night sessions count toward the previous day.
- A day counts as **met** when ≥ 1 non-review order and ≥ 80% of due reviews are cleared. The thresholds are configurable.

| Severity | Grace days | Decay rate `r` | Daily decay cap | Demotion after | Rest Tokens (max) |
|---|---|---|---|---|---|
| Gentle | 2 | 0 (no decay) | — | never | 5 |
| Standard | 1 | 3% | 10% | 10 days below floor | 3 |
| Hardcore | 0 | 6% | 20% | 5 days below floor | 1 |

```
missed          = consecutive unmet days, not covered by a token or Stasis
over            = max(0, missed − grace)
if over ≥ 1     → issue a Penalty Quest (once per streak of misses)
while a Penalty Quest is open → new XP goes to ESCROW (visible, not spendable)
decay/day       = min(cap, r × over) × xpToNext(level)      # starts on day grace+1
floor           = cumulativeXP(rankMinLevel)                 # XP never goes below this
demotion        = level held at the floor for N consecutive days → rank −1
```

A **Penalty Quest** contains the overdue reviews (up to 30) plus one small `implement` or `reflect` task from the current quest. It's sized to take about 20–30 minutes. Clearing it releases the escrow, stops decay, and marks the streak **repaired** if cleared within 48 h.

**Rest Tokens:** you earn 1 for every 7 met days, up to the severity's maximum. A token can be spent in advance, or retroactively within 48 h of a miss.

**Stasis:** freezes everything: decay, penalties, and FSRS due dates, which are shifted forward on exit. It lasts at most 30 days, with a 7-day cooldown before it can be used again.

**Worked example (Standard).** Level 15 (C rank, floor = cumulativeXP(14) = 2,925 XP). Current XP = 3,700. `xpToNext(15)` = 425.

- Day 1 missed: within grace, so nothing happens.
- Day 2 missed: over = 1. A Penalty Quest is issued. Decay = min(10%, 3%) × 425 = 13 XP → 3,687.
- Day 3 missed: over = 2. Decay = 6% × 425 = 26 XP → 3,661.
- Day 4: the learner earns 60 XP from dailies, but doesn't clear the Penalty Quest. The 60 XP goes into escrow. The day is still unmet, so decay applies: 9% × 425 = 38 → 3,623.
- Day 5: the learner clears the Penalty Quest. The escrowed 60 XP is released → 3,683, and decay stops. The streak is not marked "repaired" because the 48 h window has passed. The Ledger shows every line with its reason.

At these numbers, Standard mode needs roughly three weeks of total neglect to fall from mid-level to the rank floor. Demotion then needs another 10 days at the floor. The Re-Ascension Trial is one 30-minute session: a mini-boss built from that rank's hardest cards plus one test.

---

## 4. Architecture

### 4.1 Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router), TypeScript strict | As requested. Default build uses `output: "export"`, a static site deployable to GitHub Pages. An optional "server build" enables API routes for the Postgres adapter. |
| Local DB | **Dexie 4** (IndexedDB) + `dexie-react-hooks` | See §4.4 |
| Validation | **zod** | Course JSON, imports, and adapter payloads |
| Spaced repetition | **ts-fsrs** | Maintained reference implementation, MIT |
| UI | Tailwind CSS v4 + Radix primitives | Accessible by default |
| Motion | Motion (framer), `prefers-reduced-motion` respected | Level-up and notice animations |
| Tests | Vitest (engine is pure functions) + Playwright (flows) + axe | |
| Tooling | ESLint (flat config), Prettier, GitHub Actions CI | |

The **engine** is a pure TypeScript package (`src/engine/`): XP, ranks, decay, daily generation, methods, and evidence parsing. It takes a `Clock` and state, and returns new state plus `LogEntry[]`. No React, no I/O. This keeps the rules testable with fixed dates.

### 4.2 Data model

```ts
// Curriculum (static, from JSON)
Course  { id, version, title, language, stats: StatDef[], phases: Phase[], learningRule: Stage[] }
Phase   { id, index, title, summary, quests: Quest[], boss: BossQuest }
Quest   { id, phaseId, index, title, goal, stages: Stage[], tasks: Task[], dependsOn: QuestId[] }
Task    { id, questId, stage: Stage, type: 'read'|'implement'|'test'|'reflect'|'review'|'boss',
          title, body (md), stats: Record<StatId, number>, estMinutes, estSessions?,
          bloom?, keyTerms?, confusableWith?, quiz?: QuizItem[], cards?: CardSeed[],
          evidence?: EvidenceSpec, links?: { playground?, docs? } }
BossQuest extends Task { passCriteria: EvidenceSpec[] }   // e.g. race-clean, coverage ≥ 70%, no goroutine leak
Stage   = 'understand'|'implement'|'test'|'concurrency'|'race'|'measure'|'refactor'|'next'
EvidenceSpec { kind: 'go-test'|'go-test-race'|'go-bench'|'coverage'|'github-commit', min?, pattern? }

// Player state (in the StorageAdapter)
Player    { id, name, createdAt, xp, escrowXP, level, rank, bossesCleared: PhaseId[],
            restTokens, stasis?: { since, until }, courseId }
Stats     { playerId, statXP: Record<StatId, number> }
Progress  { playerId, taskId, status: 'locked'|'available'|'active'|'done', completedAt?, verify }
Attempt   { id, taskId, at, kind: 'quiz'|'explain'|'evidence'|'honor', payload, passed, xpAwarded }
Card      { id, taskId, statId, front, back, fsrs: FSRSCard, suspended }
ReviewLog { id, cardId, at, rating: 1|2|3|4, fsrsLog }
DailyOrders { date (YYYY-MM-DD, local, 04:00 boundary), items: OrderItem[], met, repaired, tokenUsed }
PenaltyQuest { id, issuedFor: date[], items, clearedAt? }
FocusSession { id, taskId, start, end, completed }
Reflection   { id, date, prompts: string[], text }
LogEntry  { id, at, kind: 'xp'|'decay'|'escrow'|'release'|'rank'|'penalty'|'token'|'achievement'|'stasis',
            delta, balance, reason, ref? }          // append-only ledger; XP = sum of deltas
Achievement { id, unlockedAt }
Settings  { severity, methods: MethodId[], dayBoundary, pomodoro, dailyBudgetMin, reviewCap,
            verification: 'honor'|'evidence'|'github', github?: { repo, token? (local only) },
            quietMode, theme, intentions, adapter: AdapterConfig }
```

The **log is the source of truth for XP.** `Player.xp` is a cached projection of it. This makes decay and escrow auditable, and it makes import and export plus conflict resolution easy (see §5).

### 4.3 Learning-method plugin interface

```ts
interface LearningMethod {
  id: MethodId; name: string; description: string; evidence: Citation[];
  transformStages?(quest: Quest, s: State): Stage[];               // project-based reorders stages
  contributeOrders?(ctx: DailyCtx): OrderItem[];                    // SRS adds reviews, interleave mixes
  gate?(task: Task, s: State): Gate | null;                         // recall quiz, Feynman, reflection
  xpModifier?(task: Task, a: Attempt, s: State): number;            // Pomodoro
  onComplete?(task: Task, a: Attempt, s: State): Effect[];          // SRS creates cards
}
```

### 4.4 IndexedDB vs localStorage

| | localStorage | IndexedDB (Dexie) |
|---|---|---|
| Capacity | ~5 MB per origin, strings only | Hundreds of MB to GBs; quota-managed |
| API | Synchronous, blocks the main thread | Async, transactional |
| Querying | None (manual JSON parsing) | Indexes, e.g. "cards due ≤ now", "log entries by date" |
| Fit | Theme, last tab, small preferences | Cards, review logs, attempts, the append-only ledger |

A year of daily use comes to about 300 cards × ~20 reviews plus several thousand log entries. That's a few MB of JSON, near localStorage's ceiling, and it needs indexed queries. On first run we call `navigator.storage.persist()` to request persistent storage so the browser doesn't evict the data.

---

## 5. Storage adapter

This interface deliberately mirrors the Go roadmap's `JobRepository`. It's a narrow repository interface behind which storage can be swapped.

```ts
interface StorageAdapter {
  readonly id: 'local' | 'supabase' | 'pocketbase' | 'postgres-api';
  load(): Promise<GameState | null>;
  apply(changes: ChangeSet): Promise<void>;   // puts + deletes per collection, one transaction
  replaceAll(state: GameState): Promise<void>; // import / reset
  clear(): Promise<void>;
}
// ChangeSet = { player?, settings?, put: { [collection]: rows[] }, del: { [collection]: ids[] } }
```

*Built version:* the draft had one repository per entity. The build uses a collection-level change set instead. Engine state is immutable (immer), so `diff(prev, next)` finds changed records by reference, and only those are written. Export and import are plain functions over `GameState` (`makeBundle` / `readBundle`, versioned `{ app, schema, exportedAt, state }`). They aren't adapter methods, so any adapter gets them for free.

**Adapters**

| Adapter | Browser can connect directly? | Notes |
|---|---|---|
| **LocalAdapter** (default) | ✅ IndexedDB | No account, no network |
| **Supabase** | ✅ HTTPS (PostgREST) + Row Level Security | The anon key is public by design. RLS limits access to your own rows. The user supplies the project URL and key. |
| **PocketBase** | ✅ HTTPS REST | Self-host a single binary. Good for "my own server." |
| **Postgres (your own)** | ❌ Browsers can't open raw TCP sockets, so there's no direct Postgres, MySQL, or Mongo wire protocol | Requires the **server build**, with a small Next.js API route using `pg` and the connection string in a server env var. HTTP drivers like Neon's serverless driver *can* run in a browser, but they would expose the connection string. Neon's driver prints a security warning for exactly this reason. [Neon][neon] We won't ship that path. |

**Sync strategy (MVP): single-writer with snapshots.** One adapter is active at a time.

- "Switch adapter" = `exportAll` from the old adapter, then `importAll('replace')` into the new one.
- For a remote adapter, the local IndexedDB stays as a write-through cache. The remote copy is authoritative on load.
- Merging is simple because the log is append-only: take the union of log entries by id, and last-write-wins for everything else using `updatedAt`.
- Real multi-device CRDT sync is out of scope.

**Privacy:** no telemetry and no analytics. Remote credentials and GitHub tokens are stored only in IndexedDB on the device, and are **excluded from exports** unless the user explicitly ticks "include secrets."

---

## 6. Screens and flows

| Screen | Purpose / key elements |
|---|---|
| **Onboarding** (4 steps) | 1. Name + day boundary. 2. Pick a course. 3. Pick learning methods (Balanced preset or custom; each card shows a one-line evidence summary and a "changes your flow like this" note). 4. Pick severity (Gentle, Standard, Hardcore) with a plain-language preview of what happens if you miss 3 days. Ends with a first Registry notice: "[ORDERS ISSUED]". |
| **Dashboard ("Status")** | Level, rank badge, XP bar (with escrow shown as a striped segment), 6-stat radar with sharpness, today's Daily Orders, current quest progress along the 8-stage Learning Rule, Rest Tokens, the implementation intention. |
| **Daily Orders** | Checklist of generated orders. Each opens its task. A timer launches when Pomodoro is on. A penalty banner appears if a Penalty Quest is open. |
| **Quest detail** | Stage stepper (Understand → … → Next), tasks per stage, gates (quiz, Feynman, reflection), evidence panel, Go Playground and docs links. |
| **Review session** | One card at a time: show, then rate Again/Hard/Good/Easy. Shows remaining count and retention. Fully keyboard-driven (Space, 1–4). |
| **Boss Quest ("Gate Trial")** | Pass criteria as a checklist. Paste `go test -race -cover` output or link a commit, and each criterion lights up when met. |
| **Profile / Stats** | Stats with history, Bloom depth, achievements and titles, the full **Ledger** (filterable XP log), and "Then vs Now" cards. |
| **Journal** | Reflections and Feynman explanations, searchable. |
| **Settings** | Methods, severity, Pomodoro lengths, day boundary, Stasis, verification level, storage adapter, import/export, Quiet mode, theme. |

**Core loop:** Open app → Registry notice → clear Daily Orders (reviews first, then the implement task in a timer) → reflect → XP settles, with a level-up animation if earned → tomorrow's orders are previewed.

---

## 7. Suggestions for Go learners

1. **`go test` output parser.** Handles `go test -json` (preferred) and plain text. Extracts pass/fail per test, `DATA RACE` blocks, coverage %, and benchmark ns/op. Benchmarks are stored so the Measure stage can chart "before refactor vs after."
2. **Goroutine-leak evidence.** Recognize `goleak` failure output, so bosses can require "no leaks."
3. **Concept dependency graph.** The course JSON declares `dependsOn`. The app renders a skill tree and blocks e.g. "worker pool" until "channels" and "WaitGroup" are done. Interleaving uses the same graph.
4. **Go Playground deep links** for small `read` tasks. We pre-fill a snippet via `go.dev/play` share IDs stored in the course JSON.
5. **Confusable-pair drills.** Buffered vs unbuffered channels, `Mutex` vs `RWMutex`, `context.WithTimeout` vs `time.After`, value vs pointer receivers. These feed interleaving.
6. **Race-detector boss gate.** Every Concurrency and Race stage counts as done only when `-race` evidence is clean.
7. **"Explain the output" cards.** A code snippet on the front, its output on the back (e.g. `for` loop variable capture, `select` with multiple ready cases). This is retrieval on semantics, not trivia.
8. **Repo scaffolder.** A one-click `go mod init` command plus a folder layout for each phase, copied to the clipboard. It keeps the learner's own project aligned with the quests.
9. **CLI companion (later).** A small Go binary: `gosteps submit` runs `go test -json -race ./...` and posts the result to the local app via clipboard or file. You'd practice Go while using it.
10. **Weekly "Then vs Now."** Show the code from your first worker pool next to your latest one. This is a mastery signal, not a points signal.

---

## 8. Milestones

| Milestone | Scope |
|---|---|
| **MVP = M1 + M2** | Repo, CI, course JSON + zod schema + converter script from `curriculum/go-roadmap.md`, LocalAdapter (Dexie), engine (XP, levels, ranks, stats, ledger), dashboard, quest detail, honor completion, Daily Orders, penalty, escrow, decay with all safeguards, Ledger screen. |
| **M3** | Method engine: SRS (ts-fsrs), active recall gates, Pomodoro. Then Feynman, reflection, interleaving. |
| **M4** | Evidence parser (`go test` / `-json` / `-race` / cover / bench), Boss Quests, achievements and titles. |
| **M5** | Export/import, Supabase and PocketBase adapters, optional Postgres server build. GitHub commit verification. |
| **M6** | Accessibility pass (axe, keyboard, contrast AA), Playwright suite, README with screenshots, and docs for adding a course. |
| **Later** | CLI companion, Bloom progression, worked-example fading, multi-course dashboard, PWA/offline install. |

---

## 9. Decisions made

1. **Roadmap.** No roadmap file was provided, so the curriculum was authored from research: 9 phases and 35 quests, in `curriculum/go/*.md`. It's checked against Go 1.25 and 1.26 (`wg.Go`, `testing/synctest`, `b.Loop`, `errors.AsType`, the goroutine-leak profile, Green Tea GC). The format is documented in `curriculum/README.md`.
2. **Higher tier.** Ω Ascendant means the course is complete and ≥ 90% of cards have stability ≥ 30 days.
3. **Default severity.** Standard, with Gentle labelled "recommended to start" in onboarding.
4. **License.** MIT.
5. **Deploy.** Static export (`out/`), and `NEXT_BASE_PATH` for GitHub Pages.
6. **Theme.** Dark by default. The System window always uses the dark "status screen" palette.

---

## References

[sailer]: https://doi.org/10.1007/s10648-019-09498-w
[dunlosky]: https://doi.org/10.1177/1529100612453266
[mekler]: https://doi.org/10.1016/j.chb.2015.08.048
[streaks]: https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414
[freshstart]: https://doi.org/10.1287/mnsc.2014.1901
[deci]: https://doi.org/10.1037/0033-2909.125.6.627
[hanus]: https://doi.org/10.1016/j.compedu.2014.08.019
[sdt]: https://doi.org/10.1037/0003-066X.55.1.68
[cepeda]: https://doi.org/10.1037/0033-2909.132.3.354
[fsrs]: https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
[roediger]: https://doi.org/10.1111/j.1467-9280.2006.01693.x
[adesope]: https://doi.org/10.3102/0034654316689306
[bisra]: https://doi.org/10.1007/s10648-018-9434-x
[biwer]: https://doi.org/10.1111/bjep.12593
[interleave]: https://doi.org/10.1037/bul0000209
[macnamara]: https://doi.org/10.1177/0956797614535810
[kapur]: https://doi.org/10.3102/00346543211019105
[reflect]: https://www.hbs.edu/faculty/Pages/item.aspx?num=47082
[gollwitzer]: https://doi.org/10.1016/S0065-2601(06)38002-1
[neon]: https://neon.com/docs/serverless/serverless-driver

- Sailer, M., & Homner, L. (2020). The gamification of learning: A meta-analysis. *Educational Psychology Review, 32*, 77–112.
- Dunlosky, J., et al. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest, 14*(1), 4–58.
- Mekler, E. D., et al. (2017). Towards understanding the effects of individual gamification elements on intrinsic motivation and performance. *Computers in Human Behavior, 71*, 525–534.
- Silverman, J., & Barasch, A. (2023). On or off track: How (broken) streaks affect consumer decisions. *Journal of Consumer Research, 49*(6), 1095–1117.
- Dai, H., Milkman, K. L., & Riis, J. (2014). The fresh start effect. *Management Science, 60*(10), 2563–2582.
- Lepper, M. R., Greene, D., & Nisbett, R. E. (1973). *JPSP, 28*(1), 129–137.
- Deci, E. L., Koestner, R., & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. *Psychological Bulletin, 125*(6), 627–668.
- Hanus, M. D., & Fox, J. (2015). Assessing the effects of gamification in the classroom. *Computers & Education, 80*, 152–161.
- Ryan, R. M., & Deci, E. L. (2000). Self-determination theory. *American Psychologist, 55*(1), 68–78.
- Cepeda, N. J., et al. (2006). Distributed practice in verbal recall tasks. *Psychological Bulletin, 132*(3), 354–380.
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning. *Psychological Science, 17*(3), 249–255.
- Adesope, O. O., Trevisan, D. A., & Sundararajan, N. (2017). Rethinking the use of tests. *Review of Educational Research, 87*(3), 659–701.
- Bisra, K., et al. (2018). Inducing self-explanation: A meta-analysis. *Educational Psychology Review, 30*, 703–725.
- Biwer, F., Wiradhany, W., Oude Egbrink, M., & de Bruin, A. (2023). Understanding effort regulation: Comparing "Pomodoro" breaks and self-regulated breaks. *British Journal of Educational Psychology, 93*(S2), 353–367.
- Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. *Psychological Bulletin, 145*(11), 1029–1052.
- Ericsson, K. A., Krampe, R. T., & Tesch-Römer, C. (1993). *Psychological Review, 100*(3), 363–406. Macnamara, B. N., Hambrick, D. Z., & Oswald, F. L. (2014). *Psychological Science, 25*(8), 1608–1618.
- Sinha, T., & Kapur, M. (2021). When problem solving followed by instruction works. *Review of Educational Research, 91*(5), 761–798.
- Di Stefano, G., Gino, F., Pisano, G., & Staats, B. (2014). Making experience count: The role of reflection in individual learning. HBS Working Paper 14-093.
- Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement. *Advances in Experimental Social Psychology, 38*, 69–119.
- Anderson, L. W., & Krathwohl, D. R. (2001). *A Taxonomy for Learning, Teaching, and Assessing.*
- Kahneman, D., & Tversky, A. (1979). Prospect theory. *Econometrica, 47*(2), 263–291.
