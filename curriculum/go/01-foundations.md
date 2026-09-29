# Phase 1: Foundations

> Set up the toolchain and model a job in plain Go. By the end you have an in-memory job store with a small CLI.

## Quest: Toolchain, modules, and project layout
id: q01-toolchain
goal: Create the jobq module, run it, and know what each go subcommand is for.
stats: FND 0.7, DEP 0.3
concurrency: false
terms: module, go.mod, package, main, go run, go build, gofmt, go vet

### read: Modules, packages, and the go command
minutes: 15
bloom: remember
A **module** is a versioned collection of packages, described by `go.mod`. A **package** is one directory of `.go` files that share a `package` name. The package named `main` with a `func main()` builds into an executable.

```sh
mkdir jobq && cd jobq
go mod init github.com/<you>/jobq   # writes go.mod
go run ./cmd/jobq                    # compile + run
go build -o bin/jobq ./cmd/jobq      # compile only
go vet ./...                         # suspicious-code checks
gofmt -l -w .                        # canonical formatting
```

`./...` means "this directory and everything below it". Since Go 1.26, `go mod init` writes a slightly *older* `go` line than your toolchain, so your module stays usable by people one release behind.

### read: A layout you can grow into
minutes: 10
bloom: understand
Start flat and add structure only when it hurts. A common shape for a service:

```
jobq/
  cmd/jobq/main.go      # wiring only: flags, config, start
  internal/job/         # domain types
  internal/store/       # persistence
  internal/worker/      # processing
```

Packages under `internal/` can only be imported by code rooted at the parent of `internal`. That's a compiler-enforced "private" boundary. Avoid `utils` or `common` packages: name a package after what it *provides*.

### implement: Hello, jobq
minutes: 20
sessions: 1
Create the module and `cmd/jobq/main.go`. It should print `jobq v0.0.1` and exit 0. Add a `version` variable at package level so you can override it later with `-ldflags "-X main.version=..."` (Phase 9).

Done when: `go run ./cmd/jobq` prints the version and `go vet ./...` is silent.

### test: Your first test
minutes: 15
Move the version string into a function `Version() string` in `internal/buildinfo` and write `TestVersion` in `buildinfo_test.go`. Run `go test ./...` and paste the output.

### cards
Q: What file defines a Go module, and what does its `module` line declare?
A: `go.mod`. The `module` line declares the module path, which is the import-path prefix for every package inside it.
Q: What does `./...` mean in `go test ./...`?
A: The current directory's package plus every package in subdirectories.
Q: Who can import a package under `internal/`?
A: Only code rooted at the parent directory of that `internal/` directory.

### quiz
Q: Which package name produces an executable, and what function must it have?
A: `package main` with `func main()`.

### links
- [Tutorial: Get started with Go](https://go.dev/doc/tutorial/getting-started)
- [Organizing a Go module](https://go.dev/doc/modules/layout)
- [go command reference](https://pkg.go.dev/cmd/go)

## Quest: Types, structs, and methods
id: q02-structs
goal: Model a Job with structs and methods, and pick value vs pointer receivers on purpose.
stats: FND 1.0
concurrency: false
depends: q01-toolchain
terms: struct, method, receiver, pointer receiver, zero value, type definition, iota
confusable: q04-interfaces

### read: Structs and zero values
minutes: 15
bloom: understand
Every Go type has a **zero value**: `0`, `""`, `false`, `nil`, and structs whose fields are all zero. Design types so that the zero value is useful. For example, a `sync.Mutex` needs no constructor.

```go
type Status int

const (
    StatusQueued Status = iota
    StatusRunning
    StatusSucceeded
    StatusFailed
)

type Job struct {
    ID        string
    Type      string
    Payload   []byte
    Status    Status
    Attempts  int
    CreatedAt time.Time
}
```

`iota` counts up within a `const` block, which makes it good for enums.

### read: Value vs pointer receivers
minutes: 15
bloom: apply
A method with a value receiver `(j Job)` works on a **copy**. A pointer receiver `(j *Job)` can modify the original and avoids copying large structs.

```go
func (j Job) IsDone() bool   { return j.Status >= StatusSucceeded }
func (j *Job) MarkRunning()  { j.Status = StatusRunning; j.Attempts++ }
```

Rules of thumb:
1. If any method needs a pointer receiver, use pointer receivers for all of them, for consistency.
2. A struct containing a `sync.Mutex` must never be copied, so use pointer receivers.

### implement: Model a Job
minutes: 30
sessions: 1
In `internal/job`, define `Status` (with a `String()` method), `Job`, and `New(typ string, payload []byte) *Job`. `New` sets `CreatedAt`, `StatusQueued`, and a random ID (use `crypto/rand` and `encoding/hex`).

### test: Test the state transitions
minutes: 20
Write tests for `MarkRunning`, `MarkSucceeded`, and `MarkFailed(err)`. An invalid transition, such as succeeding a queued job, should return an error.

### cards
Q: What is the zero value of a struct?
A: A struct whose every field holds its own zero value.
Q: When must you use a pointer receiver?
A: When the method mutates the receiver, when the struct is large, or when it contains something that mustn't be copied, such as a `sync.Mutex`.
Q: What does `iota` do?
A: It's a counter that starts at 0 in each `const` block and increments on each line. It's used for enumerations.

### quiz
Q: A method `func (j Job) Retry() { j.Attempts++ }` is called on a Job. Does the caller see the change?
A: No. A value receiver gets a copy, so the increment is lost.

### links
- [A Tour of Go: Methods](https://go.dev/tour/methods/1)
- [Effective Go: Methods](https://go.dev/doc/effective_go#methods)
- [Go FAQ: pointer vs value receivers](https://go.dev/doc/faq#methods_on_values_or_pointers)

## Quest: Slices, maps, and ownership
id: q03-collections
goal: Store jobs in slices and maps without falling into aliasing traps.
stats: FND 1.0
concurrency: false
depends: q02-structs
terms: slice, backing array, len, cap, append, map, comma-ok, range
confusable: q13-sync

### read: Slices share backing arrays
minutes: 15
bloom: understand
A slice is a small header: a pointer to an array, a length, and a capacity. Two slices can share the same backing array, so writing through one can change the other.

```go
a := []int{1, 2, 3, 4}
b := a[:2]          // shares a's array
b = append(b, 99)   // cap is 4, so this overwrites a[2]!
fmt.Println(a)      // [1 2 99 4]
```

To give a caller its own copy, use `slices.Clone(s)`, or use a full slice expression `s[lo:hi:hi]` so that the next `append` must reallocate.

### read: Maps and the comma-ok idiom
minutes: 10
bloom: remember
```go
jobs := map[string]*job.Job{}
j, ok := jobs[id]   // ok is false when id is missing
delete(jobs, id)
for id, j := range jobs { ... } // iteration order is random
```

A `nil` map can be read but panics on write. Maps are **not** safe for concurrent writes; you'll fix that in Phase 3. Since Go 1.21, the `maps` and `slices` packages cover the common helpers: `maps.Keys`, `slices.Sort`, `slices.SortFunc`.

### implement: MemoryStore
minutes: 35
sessions: 1
In `internal/store`, write `MemoryStore` with `Add(*job.Job)`, `Get(id) (*job.Job, error)`, and `List(status job.Status) []*job.Job`. `List` returns jobs ordered by `CreatedAt` in a **new** slice. Return a sentinel error `ErrNotFound` from `Get`.

### test: Prove there's no aliasing
minutes: 20
Write a test that calls `List`, modifies the returned slice (appends to it and reorders it), then calls `List` again and asserts the store is unchanged.

### cards
Q: What three things make up a slice header?
A: A pointer to the backing array, a length, and a capacity.
Q: What happens when you write to a nil map?
A: It panics. Reading from a nil map returns the zero value.
Q: How do you tell "missing key" apart from "zero value stored"?
A: Use the comma-ok form: `v, ok := m[k]`.

### quiz
Q: Why might `append` to a sub-slice modify the original slice?
A: If the sub-slice has spare capacity, `append` writes into the shared backing array instead of reallocating.

### links
- [Go Slices: usage and internals](https://go.dev/blog/slices-intro)
- [Go maps in action](https://go.dev/blog/maps)
- [slices package](https://pkg.go.dev/slices)

## Quest: Interfaces and composition
id: q04-interfaces
goal: Define small interfaces at the consumer and satisfy them implicitly.
stats: FND 0.8, SYS 0.2
concurrency: false
depends: q03-collections
terms: interface, implicit satisfaction, method set, embedding, adapter, any, type switch
confusable: q02-structs

### read: Small interfaces, defined where they're used
minutes: 15
bloom: understand
A type satisfies an interface just by having its methods. There's no `implements` keyword. So interfaces are usually **defined by the consumer**, and kept small:

```go
// in package worker, which consumes handlers
type Handler interface {
    Handle(ctx context.Context, j *job.Job) error
}

// adapter: lets plain functions act as Handlers
type HandlerFunc func(ctx context.Context, j *job.Job) error
func (f HandlerFunc) Handle(ctx context.Context, j *job.Job) error { return f(ctx, j) }
```

This mirrors `http.Handler` and `http.HandlerFunc` in the standard library. A good proverb to remember: "Accept interfaces, return structs."

### read: Embedding is composition, not inheritance
minutes: 10
bloom: understand
Embedding a type promotes its methods onto the outer type:

```go
type LoggingStore struct {
    *store.MemoryStore  // Add, Get, List are promoted
    log *slog.Logger
}
func (s LoggingStore) Add(j *job.Job) { s.log.Info("add", "id", j.ID); s.MemoryStore.Add(j) }
```

The outer type can override a method and still call the inner one explicitly. There's no virtual dispatch: the inner type never calls the outer type's methods.

### implement: A handler registry
minutes: 30
sessions: 1
Create `internal/worker` with the `Handler` interface, `HandlerFunc`, and a `Registry` that maps a job `Type` to its `Handler`. `Registry.Handle(ctx, j)` returns `ErrUnknownType` for unregistered types.

### test: Table-test the registry
minutes: 20
Register an `"echo"` handler and a `"fail"` handler, then test dispatch, the unknown-type error, and that the context is passed through.

### cards
Q: How does a Go type declare that it implements an interface?
A: It doesn't. Satisfaction is implicit: having the methods is enough.
Q: Where should interfaces usually be defined?
A: In the package that *uses* them (the consumer), kept as small as possible.
Q: What does the `HandlerFunc` adapter pattern do?
A: It defines a function type with a method that calls itself, so an ordinary function satisfies a single-method interface.

### quiz
Q: What's the difference between embedding and inheritance?
A: Embedding promotes the inner type's methods, but the inner type never dispatches back to the outer type. It's composition, and there's no polymorphic override.

### links
- [Effective Go: Interfaces](https://go.dev/doc/effective_go#interfaces)
- [Go Code Review Comments: Interfaces](https://go.dev/wiki/CodeReviewComments#interfaces)
- [Go Proverbs](https://go-proverbs.github.io/)

## Quest: Errors are values
id: q05-errors
goal: Create, wrap, and inspect errors so callers can make decisions.
stats: FND 0.6, REL 0.4
concurrency: false
depends: q04-interfaces
terms: error interface, sentinel error, wrapping, %w, errors.Is, errors.As, errors.AsType, errors.Join, panic
confusable: q21-retries

### read: Sentinels, types, and wrapping
minutes: 20
bloom: understand
`error` is just an interface: `Error() string`. There are three common shapes:

```go
var ErrNotFound = errors.New("job not found")          // sentinel

type ValidationError struct{ Field, Msg string }       // typed
func (e *ValidationError) Error() string { return e.Field + ": " + e.Msg }

return fmt.Errorf("get %s: %w", id, ErrNotFound)       // wrap, keeping the cause
```

Callers can inspect the whole wrapped chain:

```go
if errors.Is(err, store.ErrNotFound) { ... }
var ve *ValidationError
if errors.As(err, &ve) { ... }
if ve, ok := errors.AsType[*ValidationError](err); ok { ... } // Go 1.26+
```

`errors.Join` combines several errors, for example the failures from several jobs.

### read: When (not) to panic
minutes: 10
bloom: evaluate
Return errors for anything a caller could reasonably handle. Keep `panic` for programmer bugs and impossible states. A worker must survive a panicking handler, so in Phase 4 you'll `recover()` inside each job and turn the panic into a failed job.

Error strings are lowercase with no final punctuation, because they get wrapped into longer messages: `"get abc: job not found"`.

### implement: Errors across jobq
minutes: 30
sessions: 1
Wrap store errors with context (`fmt.Errorf("store get %q: %w", id, err)`). Add a `ValidationError` for `job.New` with an empty type. Build the CLI: `jobq add <type> <payload>`, `jobq list`, and `jobq get <id>`. The CLI should exit with code 1 and print the error on failure.

### test: Assert on error identity, not text
minutes: 20
Test that `Get` on a missing ID returns an error that satisfies `errors.Is(err, ErrNotFound)`, even when it's wrapped twice. Never compare `err.Error()` strings.

### cards
Q: What's the difference between `%w` and `%v` in `fmt.Errorf`?
A: `%w` wraps the error so `errors.Is` and `errors.As` can find it. `%v` only copies its text.
Q: `errors.Is` vs `errors.As`?
A: `Is` checks whether any error in the chain *equals* a target, such as a sentinel. `As` finds the first error in the chain of a given *type* and assigns it.
Q: When is `panic` appropriate?
A: For programmer bugs or unrecoverable invariants, not for expected failures like "not found".

### quiz
Q: You wrap `ErrNotFound` as `fmt.Errorf("x: %v", ErrNotFound)`. Does `errors.Is(err, ErrNotFound)` return true?
A: No. `%v` doesn't wrap, so the chain is lost. Use `%w`.

### links
- [Working with Errors in Go 1.13](https://go.dev/blog/go1.13-errors)
- [Errors are values (Rob Pike)](https://go.dev/blog/errors-are-values)
- [errors package](https://pkg.go.dev/errors)

## Boss: In-memory job CLI
id: boss-p1
stats: FND 0.8, TST 0.2
criteria: go-test, coverage>=60
The **Gate Trial** for Phase 1. Your `jobq` binary supports `add`, `list`, and `get` against the in-memory store, with typed and wrapped errors.

Paste the output of `go test -cover ./...`. All packages must pass, with total coverage of at least 60%.
