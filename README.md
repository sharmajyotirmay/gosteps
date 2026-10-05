# GoSteps

A leveling-style daily quest system for learning Go. You build **jobq**, a concurrent, durable job processor, across 9 phases and 35 quests. The app turns that roadmap into Daily Orders, XP, ranks, stats, review cards, Penalty Quests, and Gate Trials. It's all run by **the Registry**, a floating System window that's available on every screen.

- **Local-first.** No account, no server, no telemetry. Data lives in your browser's IndexedDB. Export a backup whenever you like.
- **Evidence-based.** Spaced repetition (FSRS), active recall, Pomodoro, interleaving, Feynman explanations, and reflection. Each method changes the actual flow. See [docs/DESIGN.md](docs/DESIGN.md) for the research and formulas.
- **Humane penalties.** Grace days, Rest Tokens, Stasis (vacation mode), XP held in escrow rather than deleted, and Gentle, Standard, or Hardcore severity.
- **DSA track: 1000 problems in 100 days.** Ten phases of patterns (35 topics, 266 verified anchor problems), solved in Go, on the same level, rank, stats, streak, and Daily Orders as the Go quests.
- **Curriculum as data.** Courses are markdown folders compiled to JSON. See [curriculum/README.md](curriculum/README.md).

All names, ranks, and visuals are original. The app isn't affiliated with any manhwa, webtoon, or game.

![The System window opening over the Status dashboard with a LEVEL UP notice](docs/screenshots/system-window.png)

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/dashboard.png" alt="Status dashboard with level, rank, stats with sharpness bars, Daily Orders, and the current quest's Learning Rule stages"></td>
    <td width="50%"><img src="docs/screenshots/quest.png" alt="Quest page with an active-recall prompt before the notes, key terms, self-check, and sources"></td>
  </tr>
  <tr>
    <td><b>Status.</b> Level, rank, stats with Sharpness (how much you'd recall right now), today's Daily Orders, and where you are in the quest's Learning Rule.</td>
    <td><b>Quest.</b> Every quest runs Understand → Build → Tests → Concurrency → Race → Measure → Refactor → Next. With active recall on, you answer before the notes appear.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/gate-trial.png" alt="Gate Trial page with pasted go test output and criteria checked: race-clean and coverage 78.8% of 70% required"></td>
    <td><img src="docs/screenshots/review.png" alt="Spaced-repetition review card with Again, Hard, Good, Easy buttons showing the next interval for each"></td>
  </tr>
  <tr>
    <td><b>Gate Trial.</b> Paste <code>go test -race -cover</code> output. The app checks for a pass, data races, leaks, and coverage.</td>
    <td><b>Review.</b> FSRS scheduling. Each button shows when you'll see the card again. Keys: Space, then 1–4.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/profile.png" alt="Profile with stats table, rank ladder from E to Ascendant, and achievements, some hidden"></td>
    <td><img src="docs/screenshots/system-commands.png" alt="System window Commands tab with quick actions and copyable go commands for the current stage"></td>
  </tr>
  <tr>
    <td><b>Profile.</b> Rank ladder (each rank needs a level and a cleared Gate Trial), stats, and achievements that stay hidden until you unlock them.</td>
    <td><b>System → Commands.</b> Quick actions, plus the exact <code>go</code> commands for the stage you're on, ready to copy.</td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/dsa.png" alt="DSA page: 129 of 1000 solved on day 15, 21 behind pace, a 100-day heatmap, today's topic Monotonic stack, and the log form"></td>
  </tr>
  <tr>
    <td colspan="2"><b>DSA.</b> Progress toward 1000, pace (ahead or behind), and a 100-square map, one square per day. Below that: today's topic with pattern notes and verified anchor problems, a quick log form, the redo queue, and the whole 100-day plan with timed Gate Trials.</td>
  </tr>
</table>

<p align="center"><img src="docs/screenshots/phone-system.png" width="300" alt="The System window's Status tab on a phone"></p>

The screenshots use demo data: two weeks of study played through the real engine (`e2e/seed.ts`). Regenerate them with `pnpm build && pnpm screenshots`.

## Run it

Requires Node 20+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm dev                 # http://localhost:3000 (rebuilds the course JSON first)
```

Production build (static site in `out/`):

```sh
pnpm build
pnpm preview             # serves out/ on http://localhost:3000
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm course:build` | Compile `curriculum/go/*.md` and `curriculum/dsa/*.md` to JSON and readable roadmaps |
| `pnpm test` | Unit tests (engine rules, evidence parser, storage, course validation) |
| `pnpm e2e` | Playwright end-to-end tests against the static build (run `pnpm build` first) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm check` | Course build, typecheck, lint, and unit tests together |
| `pnpm format` | Prettier |
| `pnpm screenshots` | Regenerate `docs/screenshots/` from demo data (run `pnpm build` first) |

## Working on the Go project alongside

The app tracks your progress, but the Go work happens in your own repo:

```sh
mkdir -p ~/Dev/jobq && cd ~/Dev/jobq
git init
go mod init github.com/<you>/jobq
mkdir -p cmd/jobq internal/{job,store,worker}
go run ./cmd/jobq
go test -race -cover ./...        # paste this output into test and race stages and Gate Trials
```

The System window's **Commands** tab shows the right `go` commands for the stage you're on.

## The DSA track

**Goal:** 1000 problems in 100 days, about 10 a day. You can change the goal and length in Settings.

**How it's organized:**
- **Same structure as the Go course.** 10 phases → 35 topics, each lasting a few days → daily problems. A timed Gate Trial closes each phase. The full plan is in [curriculum/dsa-roadmap.md](curriculum/dsa-roadmap.md).
- **Each topic** has pattern notes with Go code, 3 review cards, and 5–11 curated anchor problems. All 266 anchors were checked against LeetCode: they exist, they're free, and the difficulty labels match. Tag links fill the rest of each day's target.
- **Hints and failures come back.** "Needed a hint" returns in 3 days and "couldn't solve" in 1 day, in your **redo queue**. Re-solving without help is retrieval practice.

**How it links to your Go progress:**
- **Daily Orders** gain a "DSA day N/100" order. Meeting it counts toward the day, just like a Go task.
- **XP:** easy 8, medium 15, hard 30. Solving in Go gives +20% XP and +Fundamentals, a hint gives half, and an honest failed attempt gives 2. Everything raises the new **ALG** stat and the same level.
- **Review cards:** pattern cards go into the same FSRS deck and show up in interleaved drills.
- **Daily target:** it adjusts to what's left (5 to 20 a day), so falling behind raises it gently instead of piling on.
- **Counting:** only unique problems count toward 1000. Logging the same problem twice doesn't add.

Solve in a separate Go module, one package per problem. The DSA page's **Solve it in Go** panel copies these commands for you:

```sh
mkdir -p ~/Dev/dsa-go && cd ~/Dev/dsa-go && go mod init dsa
mkdir -p t01-hashing/two_sum && cd t01-hashing/two_sum
# write solution.go + a table-driven solution_test.go
go test ./...
```

## Using the System

- Click the floating hexagon (bottom-right), or press **Ctrl/⌘ K** or **`**. **Esc** closes it.
- It opens by itself for level ups, rank changes, Penalty Quests, Gate Trial clears, and achievements. Turn on Quiet mode in Settings to stop that.
- Tabs: **Notices**, **Status**, **Orders** (today), **Commands** (quick actions and Go commands for your stage).

## How a day works

1. At your day boundary (default 04:00), the Registry issues Daily Orders: due reviews (plus an interleaved drill from Phase 3 on), one read task, one build task, and a reflection.
2. The day is **met** when you finish one read or build order and 80% of your reviews. Clear everything for a +20% bonus.
3. A missed day first uses a grace day or an automatic Rest Token. After that it issues a **Penalty Quest**. XP you earn while it's open is **held**, not lost. On Standard and Hardcore, XP also decays, but never below your rank floor. Clear the Penalty Quest within 48 h to mark the streak as repaired.

## Architecture

```
curriculum/go/*.md      → scripts/build-course.ts → curriculum/go.course.json
src/engine/             pure TypeScript rules: XP, ranks, days, penalties, FSRS, evidence parser, methods
src/storage/            StorageAdapter interface + LocalAdapter (Dexie/IndexedDB), JSON export/import
src/components/         GameProvider (state + persistence), System button/window, task gates
src/app/                Next.js App Router pages (static export)
e2e/                    Playwright flows
```

The engine is pure and time-injected, so rules like decay and escrow are unit-tested with fixed dates. Components change state through `act((draft, ctx) => …)`. The provider saves only the records that changed.

### Connecting a database

`StorageAdapter` (in `src/storage/adapter.ts`) is the only persistence boundary. Remote adapters (Supabase and PocketBase, both reachable from a browser, plus a Postgres API route for the optional server build) are planned for milestone M5. Browsers can't open raw Postgres connections. Until then, use **Settings → Export backup** and **Import backup** to move data between devices.

## Deploying

The build is a static site. To host it on GitHub Pages under `/<repo>`, build with `NEXT_BASE_PATH=/<repo> pnpm build` and publish `out/`.

## Status

| Milestone | State |
|---|---|
| M1: course JSON, LocalAdapter, dashboard, quests with XP | ✅ |
| M2: Daily Orders, ranks, penalty, escrow, decay, safeguards, ledger | ✅ |
| M3: methods (SRS, recall, Pomodoro, Feynman, reflection, interleaving, project-first) | ✅ |
| M4: evidence parser, Gate Trials, achievements and titles | ✅ (GitHub links are recorded but not fetched yet) |
| M5: remote adapters | Export/import ✅. Supabase, PocketBase, and Postgres: planned |
| DSA track: 1000 problems / 100 days, linked to the same player | ✅ |
| M6: polish, accessibility audit, screenshots | Screenshots ✅. Accessibility audit in progress |

## License

MIT
