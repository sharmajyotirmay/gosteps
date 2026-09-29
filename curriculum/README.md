# Writing a course

A course is a folder in `curriculum/`. `pnpm course:build` validates it and writes:

- `curriculum/<id>.course.json`: the data the app loads. This is generated, so don't edit it.
- `curriculum/<id>-roadmap.md`: a readable overview. Also generated.

```
curriculum/
  go/
    course.json            # id, title, stats, Learning Rule stages
    01-foundations.md      # one file per phase, sorted by filename
    02-testing.md
    ...
```

To make the app load a different course, point `src/lib/course.ts` at its JSON file.

## Phase file format

```markdown
# Phase 1: Foundations

> One-paragraph summary of the phase.

## Quest: Toolchain, modules, and project layout
id: q01-toolchain                 # unique, stable (progress is keyed on it)
goal: One sentence.
stats: FND 0.7, DEP 0.3           # stat weights (0–1), must exist in course.json
concurrency: false                # true adds a race-detector stage automatically
depends: q00-other                # optional, comma-separated quest ids
terms: module, go.mod, package    # key terms for the Feynman gap check
confusable: q02-structs           # optional; interleaving pulls these in first

### read: Modules, packages, and the go command
minutes: 15
bloom: remember
Markdown body. Code fences are fine.

### implement: Hello, jobq
minutes: 20
sessions: 1                       # Pomodoro estimate
Body…

### test: Your first test         # evidence: go test must pass
### concurrency: …                # an implement task in the Concurrency stage
### race: …                       # evidence: go test -race must be clean
### measure: …
### refactor: …
### reflect: …

### cards
Q: Question on the front of a review card?
A: Answer on the back.

### quiz
Q: The first quiz item is the active-recall prompt for the quest's first read task.
A: Model answer.

### links
- [Title](https://…)

## Boss: In-memory job CLI
id: boss-p1
stats: FND 0.8, TST 0.2
criteria: go-test, coverage>=60   # go-test | go-test-race | goleak | coverage>=N | go-bench | github-commit
Body with the pass conditions.
```

### What the build fills in

Every quest follows the Learning Rule: Understand, Smallest implementation, Tests, Concurrency, Race detector, Measure, Refactor, Next. If you leave out Measure, Refactor, or the closing reflection, the build adds a generic task for that stage. It also adds a Race stage to every quest marked `concurrency: true`. Write your own version of a stage whenever you have something specific to say.

The build fails if an id is duplicated, a stat or quest reference is unknown, a quest has no cards, or a criterion is invalid. `scripts/build-course.test.ts` also checks that the stages run in order.
