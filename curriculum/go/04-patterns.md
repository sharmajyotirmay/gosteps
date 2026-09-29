# Phase 4: Worker Pools and Patterns

> Turn goroutines and channels into the core of jobq: a worker pool with bounded concurrency, pipelines, and zero leaked goroutines.

## Quest: The worker pool
id: q15-worker-pool
goal: Process jobs with a fixed number of workers reading from a shared channel.
stats: CON 0.8, SYS 0.2
concurrency: true
depends: q14-race
terms: worker pool, fixed workers, job channel, results channel, recover, panic isolation
confusable: q17-bounded

### read: Anatomy of a pool
minutes: 15
bloom: understand
```go
func (p *Pool) Start(ctx context.Context) {
    for i := range p.size {               // Go 1.22+: range over int
        p.wg.Go(func() { p.worker(ctx, i) })
    }
}

func (p *Pool) worker(ctx context.Context, id int) {
    for j := range p.jobs {               // exits when jobs is closed
        p.results <- p.run(ctx, j)
    }
}
```

N workers share one input channel, and the channel spreads the load for you. The pool **owns** `jobs`: `Stop` closes it and then waits on `wg`. Whoever reads `results` must keep reading, or the workers block.

### read: One bad job must not kill the pool
minutes: 10
bloom: apply
A panic in a handler would crash the whole process. Isolate each job:

```go
func (p *Pool) run(ctx context.Context, j *job.Job) (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("job %s panicked: %v", j.ID, r)
        }
    }()
    return p.reg.Handle(ctx, j)
}
```

`recover` only works inside a deferred function, in the same goroutine that panicked.

### concurrency: Build Pool
minutes: 40
sessions: 2
Write `worker.Pool` with `New(size int, reg *Registry)`, `Start(ctx)`, `Submit(j) error` (which returns `ErrStopped` after Stop), `Results() <-chan Result`, and `Stop()`. `Stop` closes the input, waits for the workers, then closes the results channel.

### test: Pool behaviour
minutes: 25
Test that 1,000 jobs across 8 workers all complete, that a panicking handler produces a failed Result instead of a crash, and that `Submit` after `Stop` returns `ErrStopped`.

### cards
Q: How does a worker know to exit in the basic pool?
A: `for j := range jobs` ends when the pool closes the `jobs` channel.
Q: Where must `recover()` be called to catch a panic?
A: Inside a deferred function in the same goroutine as the panic.
Q: What happens if nobody drains the results channel?
A: Workers block on send, the pool stalls, and `Stop` waits forever.

### quiz
Q: Why does `Stop` close `results` only after `wg.Wait()`?
A: Workers might still be sending results, and sending on a closed channel panics.

### links
- [Go by Example: Worker Pools](https://gobyexample.com/worker-pools)
- [Defer, Panic, and Recover](https://go.dev/blog/defer-panic-and-recover)

## Quest: Pipelines, fan-out and fan-in
id: q16-pipelines
goal: Compose stages connected by channels, and fan work out and back in.
stats: CON 1.0
concurrency: true
depends: q15-worker-pool
terms: pipeline, stage, fan-out, fan-in, merge, done channel, cancellation
confusable: q15-worker-pool

### read: Stages connected by channels
minutes: 20
bloom: understand
A pipeline is a series of stages. Each stage receives from an inbound channel, does work, and sends to an outbound channel **it owns and closes**.

```go
func validate(ctx context.Context, in <-chan *job.Job) <-chan *job.Job {
    out := make(chan *job.Job)
    go func() {
        defer close(out)
        for j := range in {
            if j.Type == "" { continue }
            select {
            case out <- j:
            case <-ctx.Done(): return
            }
        }
    }()
    return out
}
```

**Fan-out** means several goroutines read from the same channel. **Fan-in (merge)** combines several channels into one, closing the output after all inputs are drained, which you track with a WaitGroup.

### read: Every send needs an escape hatch
minutes: 10
bloom: analyze
If a downstream stage stops reading, upstream senders block forever, and that's a goroutine leak. Every send in a stage should be inside a `select` that also watches `ctx.Done()`. This is the central lesson of the Go blog's pipelines article.

### concurrency: Build merge and a 3-stage pipeline
minutes: 35
sessions: 2
Implement `Merge[T any](ctx, cs ...<-chan T) <-chan T`, a generic fan-in. Build decode → validate → dispatch, with dispatch fanned out to 4 goroutines.

### test: Cancel mid-stream
minutes: 20
Start a pipeline on 10,000 jobs, cancel the context after 100 results, and assert that all stages exit. Use `runtime.NumGoroutine()` before and after with a short poll, or wait for Quest 18 to use goleak.

### cards
Q: Who closes a pipeline stage's output channel?
A: The stage that created it, when its input is exhausted or the context is cancelled (`defer close(out)`).
Q: How does merge know when to close its output?
A: A WaitGroup counts the forwarding goroutines. A separate goroutine waits on it, then closes the output.
Q: Why wrap stage sends in a `select` with `ctx.Done()`?
A: So a stage can exit when downstream stops reading. Without it, the stage leaks while blocked on the send.

### quiz
Q: What's the difference between fan-out and fan-in?
A: Fan-out: several goroutines read from one channel, to parallelize work. Fan-in: several channels are merged into one.

### links
- [Go Concurrency Patterns: Pipelines and cancellation](https://go.dev/blog/pipelines)
- [Advanced Go Concurrency Patterns (Sameer Ajmani)](https://go.dev/blog/io2013-talk-concurrency)

## Quest: Bounded concurrency and backpressure
id: q17-bounded
goal: Limit in-flight work with semaphores and errgroup, and push back when overloaded.
stats: CON 0.7, REL 0.3
concurrency: true
depends: q16-pipelines
terms: semaphore, backpressure, errgroup, SetLimit, load shedding, bounded queue
confusable: q15-worker-pool

### read: A buffered channel is a semaphore
minutes: 15
bloom: apply
```go
sem := make(chan struct{}, 10)   // at most 10 in flight
for _, j := range jobs {
    sem <- struct{}{}            // acquire (blocks at 10)
    go func() {
        defer func() { <-sem }() // release
        process(j)
    }()
}
```

`golang.org/x/sync/errgroup` wraps the same idea, adds error propagation, and cancels the rest of the group on the first error:

```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(10)
for _, j := range jobs { g.Go(func() error { return process(ctx, j) }) }
return g.Wait()
```

### read: Backpressure: say no early
minutes: 10
bloom: evaluate
An unbounded queue turns overload into memory exhaustion, followed by a crash. A bounded queue gives you a choice when it's full:

1. **Block** the producer. This is backpressure.
2. **Reject** with an error, for example HTTP 429 or 503. This is load shedding.
3. **Drop** the oldest item. This is only acceptable for lossy data.

For a job system, reject with a clear error at the API edge and block inside the system.

### concurrency: Bounded submit
minutes: 30
sessions: 1
Give `Pool` a bounded queue (`queueSize`). `Submit` returns `ErrQueueFull` without blocking. Add `SubmitWait(ctx, j)`, which blocks until there's room or the context is done.

### test: Prove the bound holds
minutes: 20
Use a handler that blocks on a channel you control. Submit `workers + queueSize + 1` jobs and assert that the last one gets `ErrQueueFull`. Track the peak in-flight count with an atomic max and assert it never exceeds the number of workers.

### cards
Q: How does a buffered channel act as a semaphore?
A: Sending acquires a slot (it blocks when the buffer is full), and receiving releases one. The capacity is the concurrency limit.
Q: What does `errgroup.WithContext` add over a WaitGroup?
A: It returns the first error, and it cancels a derived context so the other goroutines can stop early.
Q: What's the difference between backpressure and load shedding?
A: Backpressure slows the producer down by blocking. Load shedding rejects excess work outright.

### quiz
Q: Why is an unbounded in-memory queue dangerous for a job system?
A: Under sustained overload it grows without limit until the process runs out of memory, and every queued job is lost.

### links
- [errgroup package](https://pkg.go.dev/golang.org/x/sync/errgroup)
- [semaphore package](https://pkg.go.dev/golang.org/x/sync/semaphore)
- [Queueing theory and backpressure (Fred Hébert)](https://ferd.ca/queues-don-t-fix-overload.html)

## Quest: Goroutine lifecycle and leaks
id: q18-leaks
goal: Guarantee every goroutine exits, and prove it in tests.
stats: CON 0.6, TST 0.4
concurrency: true
depends: q17-bounded
terms: goroutine leak, goleak, VerifyNone, VerifyTestMain, lifecycle, goroutineleak profile
confusable: q16-pipelines

### read: How goroutines leak
minutes: 15
bloom: analyze
A leaked goroutine is blocked forever and never collected. There are three classic causes:

1. Sending on a channel nobody reads, often after an early `return` in the reader.
2. Receiving from a channel nobody closes.
3. Waiting on a lock, condition, or timer that never fires.

```go
func first(ctx context.Context, urls []string) string {
    ch := make(chan string)          // BUG: unbuffered
    for _, u := range urls { go func() { ch <- fetch(u) }() }
    return <-ch                      // the other len(urls)-1 senders leak
}
```

The fix here is `make(chan string, len(urls))`, or a `select` on `ctx.Done()` around the send.

### read: Detect leaks automatically
minutes: 10
bloom: apply
```go
func TestMain(m *testing.M) { goleak.VerifyTestMain(m) }  // go.uber.org/goleak
```

goleak fails the test run if any unexpected goroutines are still alive at the end. Go 1.26 adds an experimental `goroutineleak` pprof profile, enabled with `GOEXPERIMENT=goroutineleakprofile`. It finds goroutines blocked on unreachable channels or locks in a running program.

### concurrency: Audit the pool
minutes: 25
sessions: 1
For every `go` statement in jobq, write a comment saying who stops it and how. Fix any goroutine that has no answer.

### test: goleak everywhere
minutes: 20
Add `goleak.VerifyTestMain` to every package that starts goroutines. Paste the output of `go test -race ./...`.

### cards
Q: Name the three classic causes of goroutine leaks.
A: A send with no receiver, a receive with no sender or close, and a wait on something that never happens (a lock, condition, or timer).
Q: What does `goleak.VerifyTestMain` check?
A: That no unexpected goroutines are still running when the package's tests finish.
Q: How do you fix the "first response wins" leak?
A: Buffer the channel to the number of senders, or make each send `select` on `ctx.Done()` and cancel after the first result.

### quiz
Q: A leaked goroutine holds a 1 MB buffer. Will the GC reclaim it?
A: No. The goroutine is still alive, so everything it references stays reachable.

### links
- [goleak](https://github.com/uber-go/goleak)
- [Go 1.26 release notes: goroutine leak profile](https://go.dev/doc/go1.26)
- [Never start a goroutine without knowing how it will stop (Dave Cheney)](https://dave.cheney.net/2016/12/22/never-start-a-goroutine-without-knowing-how-it-will-stop)

## Boss: Bounded, leak-free worker pool
id: boss-p4
stats: CON 0.8, TST 0.2
criteria: go-test-race, goleak, coverage>=70
The Phase 4 Gate Trial: a bounded worker pool with panic isolation, `ErrQueueFull` backpressure, and a clean `Stop()`.

Paste the output of `go test -race -cover ./...` from packages that use `goleak.VerifyTestMain`. It must pass with no `DATA RACE`, no goleak failures, and coverage of at least 70%.
