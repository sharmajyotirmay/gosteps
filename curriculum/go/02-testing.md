# Phase 2: Testing and Tooling

> Build the testing habits that the rest of the course depends on: table tests, fakes, fuzzing, benchmarks, and static analysis. The phase ends with the `JobRepository` interface.

## Quest: Table-driven tests and subtests
id: q06-table-tests
goal: Write table-driven tests with named subtests and helpful failure messages.
stats: TST 1.0
concurrency: false
depends: q05-errors
terms: table-driven test, t.Run, subtest, t.Helper, t.Fatalf, t.Errorf, t.Cleanup, -run

### read: The table-driven pattern
minutes: 15
bloom: understand
```go
func TestParseStatus(t *testing.T) {
    tests := []struct {
        name    string
        in      string
        want    job.Status
        wantErr bool
    }{
        {"queued", "queued", job.StatusQueued, false},
        {"unknown", "nope", 0, true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := job.ParseStatus(tt.in)
            if (err != nil) != tt.wantErr {
                t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
            }
            if got != tt.want {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}
```

Run a single case with `go test -run 'TestParseStatus/unknown'`. Since Go 1.22, each loop iteration gets a fresh `tt` variable, so the old `tt := tt` line is no longer needed.

### read: Good failure messages
minutes: 10
bloom: apply
Write failure messages as `got X, want Y`. Use `t.Fatalf` when the rest of the test can't continue, and `t.Errorf` to report and keep going. Call `t.Helper()` in assertion helpers so failures point at the caller's line. Use `t.Cleanup` to register teardown that runs even when the test fails.

### implement: ParseStatus and a table
minutes: 25
sessions: 1
Add `job.ParseStatus(string) (Status, error)` for the CLI's `--status` flag. Convert your earlier store tests into table-driven form.

### test: Name every case
minutes: 15
Every table row should have a `name`. Run `go test -v ./internal/job` and paste the output showing the subtests.

### cards
Q: Why use `t.Run` inside a table test?
A: Each case becomes a named subtest. You can run it alone with `-run`, and one failing case doesn't hide the others.
Q: What does `t.Helper()` change?
A: Failure line numbers point at the caller instead of inside the helper.
Q: `t.Fatalf` vs `t.Errorf`?
A: `Fatalf` stops the current test (or subtest) immediately. `Errorf` records the failure and continues.

### quiz
Q: How do you run only the `unknown` case of `TestParseStatus`?
A: `go test -run 'TestParseStatus/unknown'`.

### links
- [Go wiki: Table-driven tests](https://go.dev/wiki/TableDrivenTests)
- [Using subtests and sub-benchmarks](https://go.dev/blog/subtests)
- [testing package](https://pkg.go.dev/testing)

## Quest: Fakes, test doubles, and golden files
id: q07-fakes
goal: Test through interfaces with hand-written fakes and golden files.
stats: TST 0.8, SYS 0.2
concurrency: false
depends: q06-table-tests
terms: fake, stub, mock, dependency injection, testdata, golden file, httptest, io.Writer
confusable: q04-interfaces

### read: Prefer fakes you can read
minutes: 15
bloom: understand
Because interfaces are implicit, a test double is just a small struct:

```go
type fakeClock struct{ now time.Time }
func (c *fakeClock) Now() time.Time { return c.now }
```

Inject dependencies (clock, store, logger, random source) through struct fields or constructors. Don't reach for globals. Hand-written fakes keep your tests readable. Mocking frameworks that assert exact call sequences tend to make tests brittle.

### read: Golden files and testdata
minutes: 10
bloom: apply
The `go` tool ignores any directory named `testdata`, which makes it the conventional place for fixtures. A golden-file test compares output against a checked-in file and supports an `-update` flag:

```go
var update = flag.Bool("update", false, "update golden files")
// ...
if *update { os.WriteFile(golden, got, 0o644) }
want, _ := os.ReadFile(golden)
```

Since Go 1.26, `t.ArtifactDir()` gives you a directory for test output files that you want to keep for inspection.

### implement: Inject a clock and an output writer
minutes: 30
sessions: 1
Give `MemoryStore` a `Clock` interface. Make the CLI's `run(args []string, out io.Writer) int` testable, so that `main` becomes just `os.Exit(run(os.Args[1:], os.Stdout))`.

### test: Golden-test the list output
minutes: 20
Golden-test `jobq list` output for three jobs, using a fake clock so the timestamps are stable.

### cards
Q: Why does `testdata/` work for fixtures?
A: The go tool ignores directories named `testdata` when building packages.
Q: Fake vs mock?
A: A fake is a working lightweight implementation. A mock asserts on the calls made to it. Fakes produce less brittle tests.
Q: How do you make `main()` testable?
A: Move the logic into `run(args, stdout) int` and have `main` call `os.Exit(run(...))`.

### quiz
Q: Why inject a clock instead of calling `time.Now()` directly?
A: Tests can then control time, which keeps output deterministic and makes timeouts testable without sleeping.

### links
- [testing: TB.ArtifactDir](https://pkg.go.dev/testing#T.ArtifactDir)
- [Testable Examples in Go](https://go.dev/blog/examples)
- [Advanced Testing with Go (Mitchell Hashimoto, talk)](https://www.youtube.com/watch?v=8hQG7QlcLBk)

## Quest: Benchmarks and fuzzing
id: q08-bench-fuzz
goal: Measure performance with b.Loop and find edge cases with native fuzzing.
stats: TST 0.7, SYS 0.3
concurrency: false
depends: q07-fakes
terms: benchmark, b.Loop, ns/op, allocs/op, -benchmem, benchstat, fuzz test, corpus, testing.F

### read: Benchmarks with b.Loop
minutes: 15
bloom: apply
```go
func BenchmarkEncode(b *testing.B) {
    j := job.New("email", bytes.Repeat([]byte("x"), 1024))
    for b.Loop() {          // Go 1.24+: handles timing and prevents dead-code elimination
        _, _ = json.Marshal(j)
    }
}
```

Run it with `go test -bench=Encode -benchmem -count=10 ./internal/job | tee old.txt`. To compare two runs statistically, use `benchstat old.txt new.txt`. Never trust a single run.

### read: Native fuzzing
minutes: 15
bloom: apply
```go
func FuzzDecode(f *testing.F) {
    f.Add([]byte(`{"id":"a","type":"x"}`))   // seed corpus
    f.Fuzz(func(t *testing.T, data []byte) {
        j, err := job.Decode(data)
        if err != nil { return }
        again, err := job.Decode(must(job.Encode(j)))
        if err != nil || again.ID != j.ID { t.Fatalf("round trip mismatch") }
    })
}
```

Run it with `go test -fuzz=FuzzDecode -fuzztime=30s`. Failing inputs are saved under `testdata/fuzz/` and become regression tests.

### implement: Encode and Decode
minutes: 30
sessions: 1
Add JSON `Encode`/`Decode` for `Job` with validation: the ID must be non-empty, and the type must match `^[a-z][a-z0-9_.-]{0,63}$`.

### test: Fuzz the round trip
minutes: 25
Write `FuzzDecode` as a round-trip property and run it for at least 30 seconds. If it finds a crash, keep the corpus file and fix the bug.

### measure: Benchmark Encode
minutes: 15
Run `BenchmarkEncode` with `-benchmem -count=10` and save the result to `bench/encode.txt`. Paste the ns/op and allocs/op figures. You'll compare against them in Phase 8.

### cards
Q: What does `b.Loop()` do that the old `for i := 0; i < b.N; i++` didn't?
A: It manages the timer and keeps the compiler from optimizing the benchmarked code away. Setup that happens before the loop is excluded automatically.
Q: Where does the fuzzer store failing inputs?
A: In `testdata/fuzz/<FuzzName>/`. They then run as normal test cases on every `go test`.
Q: Why run benchmarks with `-count=10` and benchstat?
A: Single runs are noisy. benchstat reports the median and tells you whether a difference is statistically significant.

### quiz
Q: What property makes a good fuzz target for an encoder/decoder pair?
A: A round trip: decode(encode(x)) must equal x, and decoding must never panic.

### links
- [Go Fuzzing](https://go.dev/doc/security/fuzz/)
- [testing.B.Loop](https://pkg.go.dev/testing#B.Loop)
- [benchstat](https://pkg.go.dev/golang.org/x/perf/cmd/benchstat)

## Quest: Coverage, linters, and vulnerability checks
id: q09-static-analysis
goal: Use coverage, vet, staticcheck, and govulncheck as a routine quality gate.
stats: TST 0.6, DEP 0.4
concurrency: false
depends: q08-bench-fuzz
terms: -cover, -coverprofile, go tool cover, go vet, staticcheck, golangci-lint, govulncheck, go fix

### read: Coverage tells you what didn't run
minutes: 10
bloom: understand
```sh
go test -coverprofile=cover.out ./...
go tool cover -html=cover.out     # red = never executed
```

Coverage is a *floor*, not a goal. 100% covered code can still be wrong. Use the report to find untested branches, especially error paths.

### read: Static analysis you should always run
minutes: 15
bloom: apply
- `go vet ./...` ships with Go and catches printf mismatches, copied locks, and unreachable code.
- `staticcheck ./...` adds deeper checks, such as unused code and deprecated APIs.
- `golangci-lint run` bundles many linters under one config.
- `govulncheck ./...` reports only the known vulnerabilities your code actually *calls*.
- `go fix ./...` (revamped in Go 1.26) applies "modernizers" that rewrite old idioms to current APIs.

### implement: A Makefile quality gate
minutes: 25
sessions: 1
Add a `Makefile`, or a `justfile`, with a `check` target that runs `gofmt -l`, `go vet`, `staticcheck`, `go test -race -cover`, and `govulncheck`. It should fail on any finding.

### test: Raise coverage on error paths
minutes: 20
Use the HTML coverage report to find two untested error branches, then add tests for them.

### cards
Q: What makes govulncheck less noisy than dependency scanners?
A: It uses call-graph analysis and reports only the vulnerabilities in functions your code actually reaches.
Q: Which command shows coverage line by line in a browser?
A: `go tool cover -html=cover.out`.
Q: What does `go vet`'s copylocks check catch?
A: Values containing a `sync.Mutex` (or similar) being copied, for example passed by value.

### quiz
Q: Your package has 95% coverage but a bug. How is that possible?
A: Coverage only shows lines that *executed*, not that the assertions were correct or that all input combinations were tried.

### links
- [The cover story](https://go.dev/blog/cover)
- [staticcheck](https://staticcheck.dev/)
- [govulncheck tutorial](https://go.dev/doc/tutorial/govulncheck)

## Boss: The JobRepository contract
id: boss-p2
stats: TST 0.7, SYS 0.3
criteria: go-test, coverage>=75
Define the interface that every storage backend will satisfy:

```go
type JobRepository interface {
    Create(ctx context.Context, j *job.Job) error
    Get(ctx context.Context, id string) (*job.Job, error)
    List(ctx context.Context, f Filter) ([]*job.Job, error)
    Update(ctx context.Context, j *job.Job) error
}
```

Write a **reusable contract test**, `func RunRepositoryTests(t *testing.T, newRepo func() JobRepository)`, and run it against your in-memory implementation. In Phase 6 the Postgres repository must pass the same suite.

Paste the output of `go test -cover ./...`. Tests must pass with coverage of at least 75%.
