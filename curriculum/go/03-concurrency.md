# Phase 3: Concurrency Fundamentals

> Goroutines, channels, select, and the sync package. Learn to prove your code is race-free, not just hope it is.

## Quest: Goroutines and WaitGroup
id: q10-goroutines
goal: Start goroutines, wait for them, and understand what the scheduler does.
stats: CON 1.0
concurrency: true
depends: q09-static-analysis
terms: goroutine, scheduler, GOMAXPROCS, sync.WaitGroup, wg.Go, closure capture, concurrency vs parallelism
confusable: q11-channels

### read: Goroutines are cheap, not free
minutes: 15
bloom: understand
`go f()` starts `f` running concurrently. A goroutine starts with a few KB of stack that grows as needed. The runtime multiplexes many goroutines (G) onto OS threads (M) through processors (P). `GOMAXPROCS` sets the number of Ps. Since Go 1.25 it respects container CPU limits on Linux.

Concurrency is about *structure* (independent tasks). Parallelism is about *execution* (running at the same instant). You can have concurrency on one core.

**Every goroutine you start needs an owner who knows when it stops.**

### read: Waiting with WaitGroup
minutes: 15
bloom: apply
```go
var wg sync.WaitGroup
for _, j := range jobs {
    wg.Go(func() {          // Go 1.25+: Add(1) + go + Done() in one call
        process(j)          // Go 1.22+: j is per-iteration, safe to capture
    })
}
wg.Wait()
```

The pre-1.25 form, `wg.Add(1); go func() { defer wg.Done(); ... }()`, still appears in most codebases, so learn both. Call `Add` *before* the `go` statement, never inside the goroutine.

### implement: Process a batch concurrently
minutes: 30
sessions: 1
Write `worker.ProcessAll(ctx, reg *Registry, jobs []*job.Job) []error`. It runs every job in its own goroutine and returns the errors in input order. Hint: preallocate `errs := make([]error, len(jobs))` and have each goroutine write only to its own index.

### test: Order and completeness
minutes: 20
Use handlers that sleep random short durations, and assert that the errors come back in input order and that every job ran exactly once. Use an `atomic.Int64` counter.

### cards
Q: What do G, M, and P stand for in the Go scheduler?
A: G is a goroutine, M is an OS thread (machine), and P is a processor: the scheduling context that holds a run queue. GOMAXPROCS sets the number of Ps.
Q: What does `wg.Go(f)` replace?
A: `wg.Add(1); go func(){ defer wg.Done(); f() }()` (Go 1.25+).
Q: Why is writing to `errs[i]` from goroutine i safe without a lock?
A: Each goroutine writes a distinct element, and `wg.Wait()` establishes happens-before for the reader.

### quiz
Q: Why must `wg.Add(1)` come before `go func()` and not inside it?
A: If it's inside, `Wait` might run before the goroutine calls `Add`, see a count of zero, and return early.

### links
- [A Tour of Go: Goroutines](https://go.dev/tour/concurrency/1)
- [Concurrency is not parallelism (Rob Pike)](https://go.dev/blog/waza-talk)
- [sync.WaitGroup.Go](https://pkg.go.dev/sync#WaitGroup.Go)

## Quest: Channels
id: q11-channels
goal: Use unbuffered and buffered channels, closing, and ranging, and know who closes what.
stats: CON 1.0
concurrency: true
depends: q10-goroutines
terms: channel, unbuffered, buffered, close, range over channel, directional channel, nil channel, deadlock
confusable: q13-sync

### read: Unbuffered vs buffered
minutes: 15
bloom: understand
An **unbuffered** channel is a rendezvous: the send blocks until a receiver takes the value, so both sides are synchronized. A **buffered** channel `make(chan T, n)` decouples them until the buffer is full.

```go
jobs := make(chan *job.Job)        // unbuffered: handoff
results := make(chan error, 100)   // buffered: absorb bursts
```

A buffer is not a performance fix for a slow consumer. It only hides the problem until the buffer fills up.

### read: Closing and ownership
minutes: 15
bloom: apply
Rules that prevent most channel bugs:
1. **Only the sender closes**, and only when no more values will be sent.
2. Receiving from a closed channel returns the zero value immediately. Use `v, ok := <-ch` or `for v := range ch` to detect it.
3. Sending on a closed channel **panics**. So does closing it twice.
4. A `nil` channel blocks forever. Inside a `select`, that's useful for disabling a case.

Use directional types to encode ownership in signatures: `func produce(out chan<- *job.Job)` and `func consume(in <-chan *job.Job)`.

### implement: Producer and consumer
minutes: 30
sessions: 1
Write `Generate(ctx, n int) <-chan *job.Job`. It owns its channel and closes it when done. Write `Drain(in <-chan *job.Job) []*job.Job`, which ranges until the channel is closed.

### test: No deadlocks
minutes: 20
Test n = 0, 1, and 1000. A deadlock makes `go test` fail with "all goroutines are asleep", so a passing test proves the close logic is right.

### cards
Q: Who should close a channel?
A: The sender (owner), when it will send no more values. Receivers never close.
Q: What does a receive on a closed channel return?
A: The zero value immediately, with `ok == false`.
Q: What's a nil channel useful for?
A: In a `select`, setting a channel variable to nil disables that case, because operations on nil channels block forever.

### quiz
Q: What happens if two goroutines both try to close the same channel?
A: The second `close` panics: "close of closed channel".

### links
- [A Tour of Go: Channels](https://go.dev/tour/concurrency/2)
- [Effective Go: Channels](https://go.dev/doc/effective_go#channels)
- [Share Memory By Communicating](https://go.dev/blog/codelab-share)

## Quest: select, timers, and timeouts
id: q12-select
goal: Multiplex channel operations and add timeouts without leaking timers.
stats: CON 0.7, REL 0.3
concurrency: true
depends: q11-channels
terms: select, default case, time.After, time.NewTimer, time.Ticker, non-blocking send, random choice
confusable: q19-context

### read: select picks a ready case
minutes: 15
bloom: understand
```go
select {
case j := <-jobs:
    handle(j)
case <-time.After(2 * time.Second):
    return errTimeout
case <-ctx.Done():
    return ctx.Err()
}
```

If several cases are ready, `select` picks one **at random**, so don't rely on the order you wrote them in. A `default` case makes the whole `select` non-blocking.

### read: Timers in loops
minutes: 10
bloom: analyze
`time.After` in a loop creates a new timer on every iteration. Since Go 1.23, unreferenced timers are garbage-collected even if they haven't fired, so this is no longer a leak. A single `time.NewTimer` that you `Reset` is still clearer and cheaper in hot loops. For periodic work, use `time.NewTicker` and `defer t.Stop()`.

### implement: Non-blocking enqueue
minutes: 25
sessions: 1
Add `TryEnqueue(ch chan<- *job.Job, j *job.Job) bool`, which returns false immediately when the channel is full. Add `EnqueueTimeout(ctx, ch, j, d)`, which waits at most `d`.

### test: Test time without sleeping
minutes: 25
Use `testing/synctest` (Go 1.25+) so that `EnqueueTimeout` with a 10 s timeout runs instantly:

```go
func TestEnqueueTimeout(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        ch := make(chan *job.Job) // nobody receiving
        err := EnqueueTimeout(t.Context(), ch, job.New("x", nil), 10*time.Second)
        if !errors.Is(err, ErrTimeout) { t.Fatal(err) }
    })
}
```

### cards
Q: If two select cases are ready at once, which runs?
A: One chosen uniformly at random.
Q: How do you make a channel send non-blocking?
A: Put it in a `select` with a `default` case.
Q: What does `synctest.Test` provide?
A: An isolated bubble with a fake clock that advances instantly when every goroutine in the bubble is blocked.

### quiz
Q: A `select` has only `case <-ch:` and `default:`. When does `default` run?
A: Whenever `ch` has no value ready at that instant.

### links
- [A Tour of Go: Select](https://go.dev/tour/concurrency/5)
- [Testing concurrent code with testing/synctest](https://go.dev/blog/synctest)
- [Go Concurrency Patterns (Rob Pike, talk)](https://go.dev/talks/2012/concurrency.slide)

## Quest: The sync package and the memory model
id: q13-sync
goal: Protect shared state with Mutex, RWMutex, Once, and atomics, and know when to prefer channels.
stats: CON 0.8, FND 0.2
concurrency: true
depends: q12-select
terms: sync.Mutex, sync.RWMutex, sync.Once, sync/atomic, happens-before, critical section, memory model
confusable: q11-channels

### read: Mutex vs channel
minutes: 15
bloom: evaluate
The Go proverb is "Don't communicate by sharing memory; share memory by communicating". But a mutex is often the simpler tool:

- **Mutex**: protects *state*, such as a cache, a map, or counters.
- **Channel**: transfers *ownership* or *signals events*, such as work items or done notifications.

```go
type SafeStore struct {
    mu   sync.RWMutex
    jobs map[string]*job.Job
}
func (s *SafeStore) Get(id string) (*job.Job, bool) {
    s.mu.RLock(); defer s.mu.RUnlock()
    j, ok := s.jobs[id]
    return j, ok
}
```

Keep critical sections small, and never call unknown code (callbacks, I/O) while holding a lock.

### read: Happens-before in one page
minutes: 15
bloom: understand
The memory model defines when a write is guaranteed to be visible to a read in another goroutine. You're safe if the two are ordered by a synchronization event: an unlock followed by a lock, a send followed by the matching receive, a close followed by a receive that sees the close, `wg.Done` followed by `Wait` returning, or `once.Do`. Without one of these, it's a **data race**. A data race is undefined behavior, not just a "stale value".

`sync/atomic` types (`atomic.Int64`, `atomic.Pointer[T]`) give you single-word operations. They're great for counters, but they aren't a replacement for a mutex when you need to update several fields together.

### concurrency: Make the store concurrency-safe
minutes: 30
sessions: 1
Wrap `MemoryStore` in an `RWMutex`. `List` must return copies of the jobs, not pointers into the store, or callers could race with writers.

### test: Hammer it
minutes: 20
Start 50 goroutines that each Create, Get, and Update 100 jobs, while 10 goroutines call `List` in a loop. Run the test with `-race`.

### cards
Q: When is a mutex a better choice than a channel?
A: When you're protecting shared state, such as a map, a cache, or counters, rather than passing ownership or signalling events.
Q: Name three happens-before edges in Go.
A: Any three of: unlock → next lock, a send → its receive completing, close → a receive that observes the close, `wg.Done` → `Wait` returning, `once.Do(f)` completing → any later `once.Do` returning.
Q: Why not call callbacks while holding a lock?
A: Unknown code might block, take the same lock (deadlock), or take other locks in the opposite order.

### quiz
Q: Two goroutines do `counter++` on a plain int. What's the bug, and what are two fixes?
A: It's a data race, because `++` is a read-modify-write. Fix it with a `sync.Mutex` around the increment, or use `atomic.Int64.Add`.

### links
- [The Go Memory Model](https://go.dev/ref/mem)
- [sync package](https://pkg.go.dev/sync)
- [Go wiki: Use a sync.Mutex or a channel?](https://go.dev/wiki/MutexOrChannel)

## Quest: The race detector
id: q14-race
goal: Find data races with -race, and read its reports fluently.
stats: TST 0.6, CON 0.4
concurrency: true
depends: q13-sync
terms: -race, data race, ThreadSanitizer, race report, previous write, goroutine created at

### read: How -race works
minutes: 15
bloom: understand
`go test -race` builds with ThreadSanitizer instrumentation. It records memory accesses at runtime and reports two accesses from different goroutines, at least one of them a write, with no happens-before between them.

- It only finds races that **actually execute**, so tests must exercise the concurrent paths.
- It makes programs run 2–20× slower and use 5–10× more memory, so it's for tests and staging, not production.
- There are no false positives: every report is a real bug.

### read: Reading a race report
minutes: 15
bloom: analyze
```
WARNING: DATA RACE
Write at 0x00c000124018 by goroutine 8:
  jobq/internal/store.(*MemoryStore).Add()      store.go:31
Previous read at 0x00c000124018 by goroutine 7:
  jobq/internal/store.(*MemoryStore).List()     store.go:44
Goroutine 8 (running) created at:
  jobq/internal/store.TestHammer()             store_test.go:22
```

Read it top to bottom: *what* happened (write vs read), *where* (the two stacks), and *who* (where each goroutine was created). The fix is always a missing synchronization edge between the two locations.

### implement: Plant and find a race
minutes: 20
sessions: 1
On a scratch branch, remove one lock from `SafeStore`. Run the hammer test with `-race` and save the report. Then restore the lock.

### race: Make the whole module race-clean
minutes: 20
Run `go test -race -count=3 ./...` and fix every report. Paste the clean output.

### cards
Q: Can the race detector report a false positive?
A: No. Every report is a real race. But it can *miss* races in code paths that never run.
Q: What's the typical overhead of `-race`?
A: About 2–20× CPU and 5–10× memory.
Q: What are the three parts of a race report?
A: The conflicting access, the previous access with its stack, and where each goroutine was created.

### quiz
Q: Your tests pass with -race, but production crashes with "concurrent map writes". How?
A: The racy path never ran in tests. -race only detects races that actually execute.

### links
- [Data Race Detector](https://go.dev/doc/articles/race_detector)
- [Introducing the Go Race Detector](https://go.dev/blog/race-detector)

## Boss: Race-free concurrent store
id: boss-p3
stats: CON 0.7, TST 0.3
criteria: go-test-race, coverage>=70
Your `JobRepository` in-memory implementation passes the Phase 2 contract suite **and** a new concurrent hammer suite (50+ goroutines of mixed reads and writes).

Paste the output of `go test -race -cover ./...`. Tests must pass with no `DATA RACE` and coverage of at least 70%.
