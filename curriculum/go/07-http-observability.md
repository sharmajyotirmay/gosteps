# Phase 7: HTTP API and Observability

> Put an HTTP API in front of jobq, and make it observable with structured logs, metrics, and profiles.

## Quest: net/http and routing
id: q27-http
goal: Serve a JSON API with the standard library's pattern-based router.
stats: SYS 0.8, FND 0.2
concurrency: false
depends: q26-leases
terms: http.Handler, ServeMux, method patterns, path wildcards, PathValue, json.NewDecoder, MaxBytesReader, status codes
confusable: q04-interfaces

### read: Routing in Go 1.22+
minutes: 15
bloom: apply
```go
mux := http.NewServeMux()
mux.HandleFunc("POST /jobs", s.createJob)
mux.HandleFunc("GET /jobs/{id}", s.getJob)
mux.HandleFunc("GET /jobs", s.listJobs)

func (s *Server) getJob(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    ...
}
```

Methods and `{wildcards}` are built in, so for most APIs you don't need a third-party router. Always set timeouts on the server: `&http.Server{ReadHeaderTimeout: 5 * time.Second, ...}`. The zero value has none, which leaves you open to slowloris attacks.

### read: JSON in and out safely
minutes: 15
bloom: apply
```go
r.Body = http.MaxBytesReader(w, r.Body, 1<<20)   // cap the body at 1 MB
dec := json.NewDecoder(r.Body)
dec.DisallowUnknownFields()
var req CreateJobRequest
if err := dec.Decode(&req); err != nil { writeError(w, 400, err); return }
```

Map domain errors to HTTP status codes in exactly one place: `ErrNotFound`→404, `ValidationError`→400, `ErrQueueFull`→503 with `Retry-After`. Never leak internal error text to clients.

### implement: The jobs API
minutes: 40
sessions: 2
Serve `POST /jobs` (returns 201 plus a `Location` header), `GET /jobs/{id}`, `GET /jobs?status=queued&limit=50`, and `POST /jobs/{id}/cancel`. Add a `writeJSON` and `writeError` helper pair.

### test: httptest
minutes: 25
Use `httptest.NewRecorder` for handler unit tests and `httptest.NewServer` for one end-to-end test. Table-test the status codes for bad JSON, unknown fields, a body that's too large, and a missing job.

### cards
Q: How do you read `{id}` from a Go 1.22 route pattern?
A: `r.PathValue("id")`.
Q: Why set `ReadHeaderTimeout` on `http.Server`?
A: The zero value has no timeouts, so slow clients can hold connections open forever (slowloris).
Q: What does `http.MaxBytesReader` protect against?
A: Clients sending huge bodies that exhaust memory. Reads fail after the limit.

### quiz
Q: The queue is full when a client POSTs a job. Which status code, and which header?
A: 503 Service Unavailable (or 429 if it's per-client) with a `Retry-After` header.

### links
- [Routing enhancements for Go 1.22](https://go.dev/blog/routing-enhancements)
- [net/http/httptest](https://pkg.go.dev/net/http/httptest)
- [The complete guide to Go net/http timeouts (Cloudflare)](https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/)

## Quest: Middleware
id: q28-middleware
goal: Compose cross-cutting behaviour with func(http.Handler) http.Handler.
stats: SYS 0.6, REL 0.4
concurrency: false
depends: q27-http
terms: middleware, decorator, request ID, recover middleware, ResponseWriter wrapper, context values
confusable: q04-interfaces

### read: The middleware shape
minutes: 15
bloom: understand
```go
type Middleware func(http.Handler) http.Handler

func RequestID(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        id := r.Header.Get("X-Request-ID")
        if id == "" { id = newID() }
        w.Header().Set("X-Request-ID", id)
        next.ServeHTTP(w, r.WithContext(withRequestID(r.Context(), id)))
    })
}

handler := Chain(mux, Recover, RequestID, AccessLog)
```

To log the status code, wrap `ResponseWriter` in a struct that records the code passed to `WriteHeader`. Use `http.NewResponseController` to reach optional interfaces like Flush.

### implement: Recover, RequestID, AccessLog
minutes: 30
sessions: 1
Implement the three middlewares and `Chain`. Recover turns panics into a 500 and logs the stack. AccessLog records method, path, status, duration, and request ID.

### test: Middleware in isolation
minutes: 20
Test each middleware with a tiny inner handler: one that panics, one that sets 418, and one that reads the request ID from the context.

### cards
Q: What's the Go signature of HTTP middleware?
A: `func(http.Handler) http.Handler`.
Q: How do you capture the status code a handler wrote?
A: Wrap `http.ResponseWriter` in a struct that overrides `WriteHeader` to record the code.
Q: What belongs in `context` values in HTTP code?
A: Request-scoped metadata, such as a request ID or an authenticated user. Never optional parameters or dependencies.

### quiz
Q: In `Chain(mux, Recover, RequestID, AccessLog)`, which should be the outermost, and why?
A: Recover, so it catches panics from every other middleware as well as the handler.

### links
- [Writing middleware in Go (Alex Edwards)](https://www.alexedwards.net/blog/making-and-using-middleware)
- [http.ResponseController](https://pkg.go.dev/net/http#ResponseController)

## Quest: Structured logging and metrics
id: q29-slog-metrics
goal: Emit structured logs with slog and expose Prometheus metrics.
stats: SYS 0.8, REL 0.2
concurrency: false
depends: q28-middleware
terms: log/slog, slog.Handler, JSONHandler, attributes, log levels, Prometheus, counter, gauge, histogram, RED metrics
confusable: q30-pprof

### read: log/slog
minutes: 15
bloom: apply
```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
logger.Info("job finished", "job_id", j.ID, "type", j.Type, "duration_ms", d.Milliseconds())
logger = logger.With("worker", id)   // attach fields once
```

Structured logs are key-value pairs, so machines can filter by `job_id` instead of grepping text. Pass the logger explicitly, or use `slog.SetDefault` once in `main`. Since Go 1.26, `slog.NewMultiHandler` sends records to several handlers, for example JSON to stdout plus a text handler in development.

### read: What to measure
minutes: 15
bloom: evaluate
For request-driven services, measure **RED**: Rate, Errors, Duration. For a queue, also measure depth and age:

- `jobq_jobs_processed_total{type,outcome}`: a counter
- `jobq_job_duration_seconds{type}`: a histogram
- `jobq_queue_depth`: a gauge
- `jobq_oldest_queued_age_seconds`: a gauge. This is the best single alert for a queue.

Keep label cardinality low. Never use a job ID as a label.

### implement: Logs and /metrics
minutes: 35
sessions: 2
Replace every `log.Printf` with slog. Add `prometheus/client_golang` metrics for the list above, and serve `/metrics`.

### test: Metrics move
minutes: 20
Use `prometheus/testutil.ToFloat64` to assert that processing 3 jobs, 1 of them failing, increments the right counters.

### cards
Q: What does RED stand for?
A: Rate, Errors, Duration.
Q: Why never put a job ID in a metric label?
A: Every unique label value creates a new time series. Unbounded cardinality blows up memory and storage.
Q: Which single metric best shows that a queue is unhealthy?
A: The age of the oldest queued job. It grows when workers can't keep up, whatever the cause.

### quiz
Q: Counter, gauge, or histogram for job duration?
A: A histogram, so you can compute percentiles like p99.

### links
- [Structured Logging with slog](https://go.dev/blog/slog)
- [Prometheus Go client](https://prometheus.io/docs/guides/go-application/)
- [The RED Method (Tom Wilkie)](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/)

## Quest: Profiling with pprof and trace
id: q30-pprof
goal: Find CPU hot spots, allocations, lock contention, and scheduling delays.
stats: SYS 0.7, CON 0.3
concurrency: true
depends: q29-slog-metrics
terms: pprof, CPU profile, heap profile, mutex profile, block profile, goroutine profile, go tool trace, FlightRecorder, flame graph
confusable: q29-slog-metrics

### read: Profiles you can collect
minutes: 15
bloom: understand
```go
import _ "net/http/pprof"   // registers /debug/pprof/* on DefaultServeMux
```

Serve it on a separate, internal-only port. Then:

```sh
go tool pprof -http=:8081 http://localhost:6060/debug/pprof/profile?seconds=20   # CPU
go tool pprof http://localhost:6060/debug/pprof/heap
go tool pprof http://localhost:6060/debug/pprof/mutex    # needs runtime.SetMutexProfileFraction
```

Tests can write profiles too: `go test -cpuprofile cpu.out -memprofile mem.out -bench .`

### read: Execution traces
minutes: 15
bloom: analyze
pprof shows *where time goes*. `go tool trace` shows *when things happen*: goroutine scheduling, blocking, GC pauses, and how many Ps were actually busy. It's the best tool for "the CPU isn't busy but throughput is low". Since Go 1.25, `trace.FlightRecorder` keeps the last few seconds of trace in memory, so you can capture a snapshot right after a slow request.

### concurrency: Profile a load run
minutes: 30
sessions: 1
Expose pprof on `:6060`. Push 50,000 jobs through the pool with a CPU-bound handler. Capture CPU and mutex profiles and a 5-second trace.

### measure: Find one bottleneck
minutes: 25
In the flame graph, find the widest frame you own. Record in `docs/perf.md` what it is, why it's slow, and a hypothesis for a fix. Paste the top 10 from `pprof -top`.

### cards
Q: pprof vs `go tool trace`: when do you use each?
A: pprof shows aggregate cost (where CPU time or allocations go). trace shows a timeline (scheduling, blocking, GC), which is best for latency and underused CPUs.
Q: Why expose pprof on a separate port?
A: It leaks internals and can be expensive to run, so it should only be reachable internally.
Q: What must you enable before the mutex profile has data?
A: `runtime.SetMutexProfileFraction(n)` with n > 0.

### quiz
Q: CPU is at 20% but throughput is flat when you add workers. Which tool do you open first?
A: `go tool trace`, to see whether goroutines are blocked (on locks, the DB, or channels) rather than running.

### links
- [Profiling Go Programs](https://go.dev/blog/pprof)
- [Diagnostics](https://go.dev/doc/diagnostics)
- [More powerful Go execution traces](https://go.dev/blog/execution-traces-2024)

## Boss: Observable API
id: boss-p7
stats: SYS 0.7, TST 0.3
criteria: go-test-race, coverage>=70
The Phase 7 Gate Trial. There's an HTTP API for submitting, getting, listing, and cancelling jobs, with timeouts and body limits. Logs are structured with request IDs, `/metrics` exposes the RED metrics plus queue depth and age, and pprof runs on an internal port.

Paste the output of `go test -race -cover ./...` including the httptest suites. It must pass with coverage of at least 70%.
