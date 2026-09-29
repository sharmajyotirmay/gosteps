# Go: Build a Concurrent Job Processor

> Generated from `curriculum/go/` by `pnpm course:build`. Edit the phase files, not this one.

Learn Go by building jobq, a concurrent, durable job-processing system with an HTTP API, from `go mod init` to a container running in CI.

**Learning Rule** (every quest): Understand → Smallest implementation → Tests → Concurrency → Race detector → Measure → Refactor → Next

## Phase 1: Foundations

Set up the toolchain and model a job in plain Go. By the end you have an in-memory job store with a small CLI.

1. **Toolchain, modules, and project layout**: Create the jobq module, run it, and know what each go subcommand is for. _(7 tasks · 3 cards · stages: 6)_
2. **Types, structs, and methods**: Model a Job with structs and methods, and pick value vs pointer receivers on purpose. _(7 tasks · 3 cards · stages: 6)_
3. **Slices, maps, and ownership**: Store jobs in slices and maps without falling into aliasing traps. _(7 tasks · 3 cards · stages: 6)_
4. **Interfaces and composition**: Define small interfaces at the consumer and satisfy them implicitly. _(7 tasks · 3 cards · stages: 6)_
5. **Errors are values**: Create, wrap, and inspect errors so callers can make decisions. _(7 tasks · 3 cards · stages: 6)_

**Boss: In-memory job CLI**. Pass criteria: go-test, coverage ≥ 60%

## Phase 2: Testing and Tooling

Build the testing habits that the rest of the course depends on: table tests, fakes, fuzzing, benchmarks, and static analysis. The phase ends with the `JobRepository` interface.

6. **Table-driven tests and subtests**: Write table-driven tests with named subtests and helpful failure messages. _(7 tasks · 3 cards · stages: 6)_
7. **Fakes, test doubles, and golden files**: Test through interfaces with hand-written fakes and golden files. _(7 tasks · 3 cards · stages: 6)_
8. **Benchmarks and fuzzing**: Measure performance with b.Loop and find edge cases with native fuzzing. _(7 tasks · 3 cards · stages: 6)_
9. **Coverage, linters, and vulnerability checks**: Use coverage, vet, staticcheck, and govulncheck as a routine quality gate. _(7 tasks · 3 cards · stages: 6)_

**Boss: The JobRepository contract**. Pass criteria: go-test, coverage ≥ 75%

## Phase 3: Concurrency Fundamentals

Goroutines, channels, select, and the sync package. Learn to prove your code is race-free, not just hope it is.

10. **Goroutines and WaitGroup**: Start goroutines, wait for them, and understand what the scheduler does. _(8 tasks · 3 cards · stages: 7)_
11. **Channels**: Use unbuffered and buffered channels, closing, and ranging, and know who closes what. _(8 tasks · 3 cards · stages: 7)_
12. **select, timers, and timeouts**: Multiplex channel operations and add timeouts without leaking timers. _(8 tasks · 3 cards · stages: 7)_
13. **The sync package and the memory model**: Protect shared state with Mutex, RWMutex, Once, and atomics, and know when to prefer channels. _(8 tasks · 3 cards · stages: 7)_
14. **The race detector**: Find data races with -race, and read its reports fluently. _(7 tasks · 3 cards · stages: 6)_

**Boss: Race-free concurrent store**. Pass criteria: go-test-race, coverage ≥ 70%

## Phase 4: Worker Pools and Patterns

Turn goroutines and channels into the core of jobq: a worker pool with bounded concurrency, pipelines, and zero leaked goroutines.

15. **The worker pool**: Process jobs with a fixed number of workers reading from a shared channel. _(8 tasks · 3 cards · stages: 7)_
16. **Pipelines, fan-out and fan-in**: Compose stages connected by channels, and fan work out and back in. _(8 tasks · 3 cards · stages: 7)_
17. **Bounded concurrency and backpressure**: Limit in-flight work with semaphores and errgroup, and push back when overloaded. _(8 tasks · 3 cards · stages: 7)_
18. **Goroutine lifecycle and leaks**: Guarantee every goroutine exits, and prove it in tests. _(8 tasks · 3 cards · stages: 7)_

**Boss: Bounded, leak-free worker pool**. Pass criteria: go-test-race, goleak, coverage ≥ 70%

## Phase 5: Context, Cancellation, and Reliability

Jobs fail, time out, and get interrupted. Make jobq cancel cleanly, shut down gracefully, and retry the right things.

19. **context.Context**: Propagate cancellation and deadlines through every blocking call. _(8 tasks · 3 cards · stages: 7)_
20. **Graceful shutdown**: Stop accepting work, drain in-flight jobs, and exit within a deadline. _(7 tasks · 3 cards · stages: 7)_
21. **Retries, backoff, and idempotency**: Retry only retryable failures with exponential backoff and jitter, and dead-letter the rest. _(7 tasks · 3 cards · stages: 6)_
22. **Rate limiting and circuit breaking**: Protect downstream services with rate limits and fail fast when they're down. _(8 tasks · 3 cards · stages: 7)_

**Boss: Reliable execution**. Pass criteria: go-test-race, goleak, coverage ≥ 70%

## Phase 6: Persistence

Make jobs survive restarts. Move from memory to PostgreSQL, and make sure two workers can never claim the same job.

23. **database/sql and pgx**: Connect to Postgres, run parameterized queries, and configure the connection pool. _(7 tasks · 3 cards · stages: 6)_
24. **A Postgres JobRepository**: Implement JobRepository in Postgres, pass the Phase 2 contract suite, and claim jobs safely. _(8 tasks · 3 cards · stages: 7)_
25. **Migrations and embedded schema**: Version the schema with migrations embedded in the binary. _(6 tasks · 3 cards · stages: 6)_
26. **Leases, visibility timeouts, and at-least-once**: Recover jobs from crashed workers without ever losing them. _(7 tasks · 3 cards · stages: 7)_

**Boss: Durable queue**. Pass criteria: go-test-race, coverage ≥ 65%

## Phase 7: HTTP API and Observability

Put an HTTP API in front of jobq, and make it observable with structured logs, metrics, and profiles.

27. **net/http and routing**: Serve a JSON API with the standard library's pattern-based router. _(7 tasks · 3 cards · stages: 6)_
28. **Middleware**: Compose cross-cutting behaviour with func(http.Handler) http.Handler. _(6 tasks · 3 cards · stages: 6)_
29. **Structured logging and metrics**: Emit structured logs with slog and expose Prometheus metrics. _(7 tasks · 3 cards · stages: 6)_
30. **Profiling with pprof and trace**: Find CPU hot spots, allocations, lock contention, and scheduling delays. _(7 tasks · 3 cards · stages: 6)_

**Boss: Observable API**. Pass criteria: go-test-race, coverage ≥ 70%

## Phase 8: Performance and Scheduling

Measure first, then optimize. Add priorities and delayed jobs, and size the worker pool with queueing math instead of guesses.

31. **Allocations and escape analysis**: Reduce allocations in the hot path, guided by benchmarks and escape analysis. _(6 tasks · 3 cards · stages: 5)_
32. **Priorities and delayed jobs**: Schedule jobs by priority and run time with container/heap and the database. _(8 tasks · 3 cards · stages: 7)_
33. **Load testing and sizing the pool**: Load-test jobq and choose the worker count with Little's Law. _(7 tasks · 3 cards · stages: 6)_

**Boss: Performance report**. Pass criteria: go-test-race, go-bench

## Phase 9: Deployment

Ship it. Build a small container, run CI on every push, and cut a versioned release.

34. **Builds and containers**: Build a static, versioned binary and package it in a minimal container. _(7 tasks · 3 cards · stages: 6)_
35. **CI/CD and releases**: Run tests, race checks, linters, and vulnerability scans on every push, and release from tags. _(7 tasks · 3 cards · stages: 6)_

**Boss: Ship jobq**. Pass criteria: go-test-race, github-commit
