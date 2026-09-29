# Phase 5: Context, Cancellation, and Reliability

> Jobs fail, time out, and get interrupted. Make jobq cancel cleanly, shut down gracefully, and retry the right things.

## Quest: context.Context
id: q19-context
goal: Propagate cancellation and deadlines through every blocking call.
stats: REL 0.8, CON 0.2
concurrency: true
depends: q18-leaks
terms: context.Context, WithCancel, WithTimeout, WithDeadline, WithCancelCause, ctx.Done, ctx.Err, context.Cause, WithoutCancel
confusable: q12-select

### read: What context is for
minutes: 20
bloom: understand
A `context.Context` carries **cancellation**, a **deadline**, and request-scoped **values** across API boundaries. Contexts form a tree: cancelling a parent cancels every child.

```go
ctx, cancel := context.WithTimeout(parent, 5*time.Second)
defer cancel()                 // always, to release resources

select {
case res := <-work:
    return res, nil
case <-ctx.Done():
    return nil, ctx.Err()      // context.Canceled or context.DeadlineExceeded
}
```

Conventions: `ctx` is the first parameter, it's never stored in a struct, and it's never nil (use `context.TODO()` while refactoring). Values are for request-scoped metadata like a request ID. Never use them for optional parameters.

### read: Causes and detaching
minutes: 10
bloom: apply
`context.WithCancelCause` lets you record *why* something was cancelled, and `context.Cause(ctx)` reads it back. Since Go 1.26, `signal.NotifyContext` records which signal caused the cancellation. `context.WithoutCancel(ctx)` keeps the values but drops cancellation. Use it for cleanup work, like writing a final status, that must finish after the request is cancelled.

### concurrency: Thread ctx through jobq
minutes: 30
sessions: 1
Every `Handler.Handle` and repository method already takes a `ctx`. Now make them honor it: the sleep handler should `select` on `ctx.Done()`, and the pool should give each job `context.WithTimeout(ctx, job.Timeout)`.

### test: Timeouts without waiting
minutes: 20
Use `synctest.Test` to prove that a job with a 30 s timeout and a handler that blocks forever fails with `context.DeadlineExceeded`, in milliseconds of real time.

### cards
Q: Why must you always call the `cancel` function returned by `WithTimeout`?
A: It releases the timer and the child context's resources. Without it, they live until the deadline expires.
Q: What two errors can `ctx.Err()` return?
A: `context.Canceled` and `context.DeadlineExceeded`.
Q: When should you use `context.WithoutCancel`?
A: For work that must finish even after the parent is cancelled, such as recording a final status, while keeping the parent's values.

### quiz
Q: Should a struct field hold a `context.Context`?
A: Generally no. Pass it explicitly as the first argument of each call that needs it.

### links
- [context package](https://pkg.go.dev/context)
- [Go Concurrency Patterns: Context](https://go.dev/blog/context)
- [Contexts and structs](https://go.dev/blog/context-and-structs)

## Quest: Graceful shutdown
id: q20-shutdown
goal: Stop accepting work, drain in-flight jobs, and exit within a deadline.
stats: REL 0.8, SYS 0.2
concurrency: true
depends: q19-context
terms: signal.NotifyContext, SIGTERM, drain, shutdown deadline, in-flight, http.Server.Shutdown
confusable: q18-leaks

### read: The shutdown sequence
minutes: 15
bloom: understand
```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()

pool.Start(ctx)
<-ctx.Done()                                  // a signal arrived

shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
if err := pool.Shutdown(shutdownCtx); err != nil {
    log.Printf("forced shutdown: %v", err)    // the deadline hit first
}
```

The order matters: (1) stop accepting new work, (2) let in-flight jobs finish, (3) cancel whatever is left when the deadline hits, (4) flush state and exit. Kubernetes sends SIGTERM, then SIGKILL after `terminationGracePeriodSeconds`, which defaults to 30 s.

### concurrency: Pool.Shutdown(ctx)
minutes: 35
sessions: 2
Implement `Shutdown(ctx) error`. It rejects new submits, lets queued and in-flight jobs finish, and returns `ctx.Err()` if the deadline expires. In that case it cancels the jobs' contexts and marks their jobs as `interrupted` so they can be retried.

### test: Both endings
minutes: 25
Test a clean drain, where every job completes before the deadline, and a forced shutdown, where a blocking handler causes `DeadlineExceeded` and the job is marked interrupted. Use goleak.

### cards
Q: Which signal does Kubernetes send first when stopping a pod?
A: SIGTERM, then SIGKILL after the grace period (30 s by default).
Q: What are the four steps of a graceful shutdown?
A: Stop intake, drain in-flight work, cancel what remains at the deadline, then flush and exit.
Q: Why use a *new* context for the shutdown deadline?
A: The signal context is already cancelled, so the shutdown needs its own fresh deadline.

### quiz
Q: What should happen to a job interrupted by a forced shutdown?
A: It should be recorded as interrupted or requeued, not lost and not marked as succeeded, so it can be retried later.

### links
- [signal.NotifyContext](https://pkg.go.dev/os/signal#NotifyContext)
- [http.Server.Shutdown](https://pkg.go.dev/net/http#Server.Shutdown)
- [Kubernetes: Pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)

## Quest: Retries, backoff, and idempotency
id: q21-retries
goal: Retry only retryable failures with exponential backoff and jitter, and dead-letter the rest.
stats: REL 1.0
concurrency: false
depends: q20-shutdown
terms: retry, exponential backoff, jitter, max attempts, dead-letter queue, idempotency, transient vs permanent error
confusable: q05-errors

### read: Backoff with jitter
minutes: 15
bloom: apply
Retrying immediately makes an overloaded dependency worse. Retrying on the same schedule as every other client creates synchronized waves (a thundering herd). Use **exponential backoff with full jitter**:

```go
func backoff(attempt int, base, max time.Duration) time.Duration {
    d := min(max, base<<attempt)            // base * 2^attempt, capped
    return time.Duration(rand.Int64N(int64(d)))  // full jitter: [0, d)
}
```

Always cap the number of attempts. After the last attempt, move the job to a **dead-letter** state so a human can inspect it.

### read: What is safe to retry?
minutes: 15
bloom: evaluate
Only retry **transient** failures: timeouts, 503 responses, and connection resets. Never retry **permanent** ones, such as validation errors, 4xx responses, or "unknown job type". Mark the difference in the type system:

```go
type PermanentError struct{ Err error }
func (e PermanentError) Error() string { return e.Err.Error() }
func (e PermanentError) Unwrap() error { return e.Err }
```

A job queue gives **at-least-once** delivery, so handlers must be **idempotent**. Running the same job twice must be harmless. Use an idempotency key, for example "send email X for job ID Y only once".

### implement: Retry policy
minutes: 30
sessions: 1
Add `RetryPolicy{MaxAttempts, Base, Max}`. When a job fails with a non-permanent error, requeue it with `RunAt = now + backoff(attempts)`. After `MaxAttempts`, set its status to `dead`.

### test: Deterministic backoff
minutes: 20
Inject the random source and the clock. Assert that the delays are within `[0, base·2^n)` and capped, that a permanent error is never retried, and that the job is dead after `MaxAttempts`.

### cards
Q: Why add jitter to exponential backoff?
A: It spreads the retries out, so many clients don't hit a recovering service at the same moments (the thundering herd).
Q: Which errors should never be retried?
A: Permanent ones, such as validation failures, most 4xx responses, and unknown job types.
Q: Why must job handlers be idempotent?
A: Queues deliver at least once, so a job can run twice after a crash or timeout. Running it again must not cause duplicate effects.

### quiz
Q: A handler charges a credit card and then times out before recording success. What protects the customer on retry?
A: An idempotency key, such as the job ID, sent to the payment provider or checked before charging, so the second attempt is a no-op.

### links
- [Exponential Backoff And Jitter (AWS Architecture Blog)](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Timeouts, retries, and backoff with jitter (Amazon Builders' Library)](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [Making retries safe with idempotent APIs (Amazon Builders' Library)](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)

## Quest: Rate limiting and circuit breaking
id: q22-limits
goal: Protect downstream services with rate limits and fail fast when they're down.
stats: REL 0.8, SYS 0.2
concurrency: true
depends: q21-retries
terms: token bucket, rate.Limiter, Wait, Allow, burst, circuit breaker, half-open, fail fast
confusable: q17-bounded

### read: Token buckets with x/time/rate
minutes: 15
bloom: apply
```go
lim := rate.NewLimiter(rate.Limit(50), 10)   // 50 events/s, bursts of 10
if err := lim.Wait(ctx); err != nil { return err }  // blocks, respects ctx
if !lim.Allow() { return ErrRateLimited }           // non-blocking check
```

A token bucket refills at a fixed rate and allows short bursts of up to its capacity. Use one limiter per downstream dependency, for example per job type.

### read: Circuit breakers
minutes: 15
bloom: understand
When a dependency is down, retries just add load and latency. A circuit breaker has three states:

- **Closed**: calls pass through, and failures are counted.
- **Open**: after N failures, calls fail immediately for a cool-down period.
- **Half-open**: one trial call decides whether to close the breaker again or reopen it.

Combine it with retries: the breaker sits *inside* the retry loop, so an open circuit fails fast instead of waiting through every backoff.

### concurrency: Per-type limits
minutes: 30
sessions: 1
Add an optional `rate.Limiter` per job type to the pool, and a simple breaker around handlers. When the breaker is open, return a retryable `ErrCircuitOpen`.

### test: Limiter and breaker transitions
minutes: 25
Use synctest to check that 100 jobs at 10/s take about 10 s of fake time. Table-test the breaker's closed → open → half-open → closed transitions.

### cards
Q: What does the burst parameter of `rate.NewLimiter` control?
A: The bucket size: how many events can happen at once before the steady refill rate applies.
Q: What are the three circuit-breaker states?
A: Closed (normal operation), open (fail fast), and half-open (allow a trial call).
Q: `lim.Wait(ctx)` vs `lim.Allow()`?
A: `Wait` blocks until a token is available or the context ends. `Allow` returns immediately with true or false.

### quiz
Q: Why put the circuit breaker inside the retry loop instead of outside it?
A: So each retry attempt checks the breaker. An open circuit then fails fast instead of sleeping through backoffs against a dead service.

### links
- [golang.org/x/time/rate](https://pkg.go.dev/golang.org/x/time/rate)
- [CircuitBreaker (Martin Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Go wiki: Rate limiting](https://go.dev/wiki/RateLimiting)

## Boss: Reliable execution
id: boss-p5
stats: REL 0.8, TST 0.2
criteria: go-test-race, goleak, coverage>=70
The Phase 5 Gate Trial. Every job has a timeout. Transient failures retry with jittered backoff and dead-letter after `MaxAttempts`. SIGTERM triggers a graceful drain within a deadline, and interrupted jobs aren't lost.

Paste the output of `go test -race -cover ./...`. It must pass, be race-clean and goleak-clean, with coverage of at least 70%.
