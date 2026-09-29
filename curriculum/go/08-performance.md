# Phase 8: Performance and Scheduling

> Measure first, then optimize. Add priorities and delayed jobs, and size the worker pool with queueing math instead of guesses.

## Quest: Allocations and escape analysis
id: q31-allocations
goal: Reduce allocations in the hot path, guided by benchmarks and escape analysis.
stats: SYS 0.7, TST 0.3
concurrency: false
depends: q30-pprof
terms: escape analysis, heap vs stack, -gcflags=-m, allocs/op, sync.Pool, preallocation, strings.Builder, GC, Green Tea GC
confusable: q30-pprof

### read: Where values live
minutes: 15
bloom: understand
The compiler puts a value on the **stack** when it can prove the value doesn't outlive the function. Otherwise it **escapes** to the heap, which costs an allocation plus GC work later.

```sh
go build -gcflags='-m' ./internal/job 2>&1 | grep escape
# ./encode.go:14:6: moved to heap: buf
```

Common causes of escapes: returning a pointer to a local, storing something in an interface, closures capturing variables, and slices whose size isn't known at compile time. Go 1.26 stack-allocates more slice backing stores automatically, and its default Green Tea GC cuts GC overhead by roughly 10–40%. Measure again after upgrading.

### read: Cheap wins, in order
minutes: 15
bloom: apply
1. **Preallocate**: `make([]T, 0, n)` when you know `n`.
2. **Reuse buffers**: `sync.Pool` for short-lived, same-sized objects such as encode buffers. Always `Reset()` them before reuse.
3. **Avoid conversions**: `[]byte` ↔ `string` conversions copy.
4. **Stream**: `json.NewEncoder(w)` instead of `Marshal` and then `Write`.

Only keep a change if benchstat shows a significant improvement.

### implement: Optimize Encode
minutes: 35
sessions: 2
Starting from your Phase 2 `bench/encode.txt`, reduce allocs/op in the job encode path. Try preallocation and a pooled buffer.

### measure: benchstat before and after
minutes: 20
Run `go test -bench=Encode -benchmem -count=10 > new.txt` and then `benchstat bench/encode.txt new.txt`. Paste the table. Keep only the changes with p < 0.05.

### cards
Q: How do you see why a variable escapes to the heap?
A: `go build -gcflags='-m'`. Add `-m=2` for the reasoning.
Q: What's the main rule when using `sync.Pool`?
A: Reset objects before reuse. Remember the pool may drop objects at any GC, so it's a cache, not storage.
Q: Name two common causes of heap escapes.
A: Any two of: returning a pointer to a local, assigning to an interface, closures capturing variables, and slices of non-constant size.

### quiz
Q: Your change makes the benchmark 3% faster, and benchstat reports p = 0.4. Keep it?
A: No. The difference isn't statistically significant, so it could be noise. Keep the simpler code.

### links
- [A Guide to the Go Garbage Collector](https://go.dev/doc/gc-guide)
- [sync.Pool](https://pkg.go.dev/sync#Pool)
- [Go 1.26: Green Tea GC](https://go.dev/doc/go1.26)

## Quest: Priorities and delayed jobs
id: q32-scheduling
goal: Schedule jobs by priority and run time with container/heap and the database.
stats: SYS 0.7, CON 0.3
concurrency: true
depends: q31-allocations
terms: priority queue, container/heap, heap.Interface, delayed job, run_at, cron, starvation, aging
confusable: q24-postgres-repo

### read: container/heap
minutes: 20
bloom: apply
`container/heap` turns any type that implements `heap.Interface` (sort.Interface plus Push and Pop) into a min-heap:

```go
type jobHeap []*job.Job
func (h jobHeap) Len() int           { return len(h) }
func (h jobHeap) Less(i, j int) bool { // higher priority first, then earlier RunAt
    if h[i].Priority != h[j].Priority { return h[i].Priority > h[j].Priority }
    return h[i].RunAt.Before(h[j].RunAt)
}
func (h jobHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *jobHeap) Push(x any)        { *h = append(*h, x.(*job.Job)) }
func (h *jobHeap) Pop() any          { old := *h; n := len(old); x := old[n-1]; *h = old[:n-1]; return x }
```

Push and Pop are O(log n). The heap isn't safe for concurrent use, so guard it with a mutex.

### read: Starvation
minutes: 10
bloom: evaluate
With strict priorities, a steady stream of high-priority work can starve low-priority jobs forever. There are two common fixes: **aging**, where the effective priority rises with wait time, and **weighted fair queuing**, where for example every 5th pick comes from the low-priority lane. In Postgres, the claim query's `ORDER BY` handles priority, and `run_at <= now()` handles delays.

### concurrency: Scheduler for the in-memory backend
minutes: 35
sessions: 2
Build a scheduler around a heap guarded by a mutex. It wakes when the earliest `RunAt` arrives (using a timer that it resets on every push) and hands due jobs to the pool.

### test: Order, delays, and starvation
minutes: 25
Use synctest to check that a delayed job doesn't run early and does run on time, that priority order is respected, and that with aging on, a low-priority job runs within a bounded number of picks.

### cards
Q: What five methods does `heap.Interface` require?
A: Len, Less, Swap (from sort.Interface), plus Push and Pop.
Q: What is starvation in a priority queue?
A: Low-priority items never run because higher-priority items keep arriving.
Q: What's the time complexity of heap.Push and heap.Pop?
A: O(log n).

### quiz
Q: How does "aging" prevent starvation?
A: A job's effective priority increases the longer it waits, so eventually it outranks newer high-priority jobs.

### links
- [container/heap](https://pkg.go.dev/container/heap)
- [Starvation (Wikipedia)](https://en.wikipedia.org/wiki/Starvation_(computer_science))

## Quest: Load testing and sizing the pool
id: q33-load
goal: Load-test jobq and choose the worker count with Little's Law.
stats: SYS 0.8, REL 0.2
concurrency: true
depends: q32-scheduling
terms: Little's Law, throughput, latency, p99, utilization, saturation, load generator, coordinated omission
confusable: q17-bounded

### read: Little's Law
minutes: 15
bloom: apply
**L = λ × W**: the average number of items in the system equals the arrival rate times the average time each item spends there.

If jobs arrive at 200/s and each takes 50 ms of handler time, you need at least 200 × 0.05 = **10** busy workers. Running at 100% utilization makes queue time explode, so aim for 60–80%: about 13–16 workers.

Latency percentiles matter more than averages: p99 is what your unluckiest 1% of users see.

### read: Honest load tests
minutes: 10
bloom: evaluate
A load generator that waits for each response before sending the next request hides stalls. This is **coordinated omission**. Use an open-model generator that sends at a fixed rate whatever the response times, such as `vegeta` or `k6`, and record latency from the *intended* send time.

### concurrency: Load test jobq
minutes: 40
sessions: 2
Write a small open-model load generator in Go, or use vegeta, to POST jobs at 50, 100, 200, and 400 per second for 60 s each. Record throughput, p50/p99 enqueue latency, and the oldest-job age.

### measure: Size the pool
minutes: 25
Use Little's Law to predict the worker count for 200 jobs/s. Run the test with your prediction, 0.5×, and 2×. Paste a table of workers vs p99 vs throughput, and say which you'd ship.

### cards
Q: State Little's Law.
A: L = λW: the items in the system equal the arrival rate times the time in the system.
Q: Why target 60–80% utilization instead of 100%?
A: Queueing delay grows sharply as utilization approaches 100%, so small bursts cause huge latency spikes.
Q: What is coordinated omission?
A: When a closed-loop load generator waits for slow responses, it sends fewer requests during stalls and under-reports tail latency.

### quiz
Q: 100 jobs/s arrive, and each takes 200 ms. What's the minimum number of busy workers?
A: 100 × 0.2 = 20.

### links
- [Little's Law (Wikipedia)](https://en.wikipedia.org/wiki/Little%27s_law)
- [vegeta load testing](https://github.com/tsenart/vegeta)
- [How NOT to Measure Latency (Gil Tene)](https://www.youtube.com/watch?v=lJ8ydIuPFeU)

## Boss: Performance report
id: boss-p8
stats: SYS 0.7, TST 0.3
criteria: go-test-race, go-bench
The Phase 8 Gate Trial. Write `docs/perf.md` with a benchstat before/after for the encode path, a pprof finding with its fix, and a load-test table with the worker count you chose and why.

Paste the output of `go test -race ./... && go test -bench=. -benchmem -run=^$ ./...`. Tests must pass, and the output must include benchmark results.
