# Phase 6: Persistence

> Make jobs survive restarts. Move from memory to PostgreSQL, and make sure two workers can never claim the same job.

## Quest: database/sql and pgx
id: q23-database-sql
goal: Connect to Postgres, run parameterized queries, and configure the connection pool.
stats: SYS 0.8, FND 0.2
concurrency: false
depends: q22-limits
terms: database/sql, sql.DB, pgx, pgxpool, connection pool, QueryRowContext, Scan, sql.ErrNoRows, placeholders
confusable: q24-postgres-repo

### read: sql.DB is a pool, not a connection
minutes: 15
bloom: understand
`sql.Open` doesn't connect. It returns a long-lived **pool** that's safe for concurrent use. Create it once at startup.

```go
db, err := sql.Open("pgx", os.Getenv("DATABASE_URL"))  // github.com/jackc/pgx/v5/stdlib
db.SetMaxOpenConns(20)
db.SetMaxIdleConns(20)
db.SetConnMaxLifetime(30 * time.Minute)
if err := db.PingContext(ctx); err != nil { ... }
```

Always use the `...Context` variants so queries honor cancellation. You can also use pgx's native `pgxpool` API directly, which is faster and supports more Postgres types. Both are fine choices.

### read: Queries, scanning, and NULL
minutes: 15
bloom: apply
```go
row := db.QueryRowContext(ctx,
    `SELECT id, type, status, attempts FROM jobs WHERE id = $1`, id)
var j job.Job
if err := row.Scan(&j.ID, &j.Type, &j.Status, &j.Attempts); err != nil {
    if errors.Is(err, sql.ErrNoRows) { return nil, ErrNotFound }
    return nil, fmt.Errorf("get job %s: %w", id, err)
}
```

Never build SQL with `fmt.Sprintf`. Placeholders (`$1`) prevent injection. Nullable columns scan into `sql.Null[T]` or pointers. When you use `Query`, always `defer rows.Close()` and check `rows.Err()` after the loop.

### implement: Connect jobq to Postgres
minutes: 30
sessions: 1
Run Postgres locally (`docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17`). Read `DATABASE_URL` from the environment, ping at startup, and fail fast with a clear message.

### test: Integration test build tag
minutes: 20
Put database tests behind `//go:build integration`, and skip them when `DATABASE_URL` is unset. Run them with `go test -tags=integration ./...`.

### cards
Q: Does `sql.Open` open a network connection?
A: No. It validates its arguments and returns a pool. Connections are made lazily, so call `PingContext` to check.
Q: How do you detect "no row found" with QueryRow?
A: `errors.Is(err, sql.ErrNoRows)` on the error from `Scan`.
Q: What must you do after iterating `rows`?
A: `rows.Close()` (usually deferred) and check `rows.Err()`.

### quiz
Q: Why is `fmt.Sprintf("... WHERE id = '%s'", id)` dangerous?
A: It allows SQL injection. Use placeholders like `$1` so the driver sends parameters separately from the query.

### links
- [Tutorial: Accessing a relational database](https://go.dev/doc/tutorial/database-access)
- [Managing connections](https://go.dev/doc/database/manage-connections)
- [pgx](https://github.com/jackc/pgx)

## Quest: A Postgres JobRepository
id: q24-postgres-repo
goal: Implement JobRepository in Postgres, pass the Phase 2 contract suite, and claim jobs safely.
stats: SYS 0.7, CON 0.3
concurrency: true
depends: q23-database-sql
terms: transaction, BeginTx, FOR UPDATE SKIP LOCKED, row lock, isolation level, contract test
confusable: q26-leases

### read: Transactions in Go
minutes: 15
bloom: apply
```go
tx, err := db.BeginTx(ctx, nil)
if err != nil { return err }
defer tx.Rollback()            // no-op after a successful Commit

if _, err := tx.ExecContext(ctx, `UPDATE ...`, ...); err != nil { return err }
return tx.Commit()
```

Everything inside a transaction must use `tx`, not `db`. Using `db` would silently run on a different connection, outside the transaction.

### read: Claiming work with SKIP LOCKED
minutes: 20
bloom: analyze
To let many workers pull from one table without two of them getting the same job:

```sql
UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = now() + interval '5 minutes'
WHERE id = (
  SELECT id FROM jobs
  WHERE status = 'queued' AND run_at <= now()
  ORDER BY priority DESC, run_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING id, type, payload, attempts;
```

`FOR UPDATE` locks the selected row. `SKIP LOCKED` makes other workers skip locked rows instead of waiting. This makes Postgres a solid queue for moderate throughput, with no extra infrastructure.

### concurrency: PostgresRepository + Claim
minutes: 45
sessions: 2
Implement the full `JobRepository` in Postgres, plus `Claim(ctx) (*job.Job, error)` using the query above. It returns `ErrNoJobs` when the queue is empty.

### test: Contract suite + concurrent claims
minutes: 30
Run `RunRepositoryTests` from Phase 2 against Postgres. Then insert 500 jobs, have 20 goroutines call `Claim` concurrently, and assert that every job was claimed exactly once.

### cards
Q: What does `SKIP LOCKED` do?
A: Rows that are already locked by another transaction are skipped instead of waited on, so concurrent workers each get different rows.
Q: Why `defer tx.Rollback()` right after `BeginTx`?
A: It guarantees a rollback on any early return or panic. After `Commit` succeeds, it's a harmless no-op.
Q: What's the bug if you call `db.ExecContext` inside a transaction?
A: It runs on another connection outside the transaction, so its changes aren't atomic with the rest.

### quiz
Q: Without `SKIP LOCKED`, what happens when 20 workers claim at once?
A: They all try to lock the same first row, so they serialize behind it. Throughput collapses, even though they'd still get distinct jobs one at a time.

### links
- [PostgreSQL: SELECT … FOR UPDATE SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [Executing transactions (Go docs)](https://go.dev/doc/database/execute-transactions)
- [The unreasonable effectiveness of SKIP LOCKED (Craig Ringer)](https://www.2ndquadrant.com/en/blog/what-is-select-skip-locked-for-in-postgresql-9-5/)

## Quest: Migrations and embedded schema
id: q25-migrations
goal: Version the schema with migrations embedded in the binary.
stats: SYS 0.6, DEP 0.4
concurrency: false
depends: q24-postgres-repo
terms: migration, up/down, embed, embed.FS, goose, schema version, index
confusable: q34-containers

### read: embed.FS and migrations
minutes: 15
bloom: apply
```go
//go:embed migrations/*.sql
var migrations embed.FS
```

`//go:embed` bakes files into the binary at compile time, so the deployable stays a single file. A migration tool (such as `pressly/goose`, `golang-migrate`, or your own ~50 lines) applies numbered files in order and records the version in a table.

Add the indexes your claim query needs: `CREATE INDEX ON jobs (status, run_at) WHERE status = 'queued';`. A **partial index** keeps it small.

### implement: jobq migrate
minutes: 30
sessions: 1
Add a `jobq migrate up` command that applies the embedded migrations. Create the `jobs` table (id, type, payload jsonb, status, priority, attempts, max_attempts, run_at, locked_until, last_error, created_at, updated_at) and a partial index.

### test: Fresh database each test
minutes: 25
Have each integration test create its own schema (`CREATE SCHEMA test_<random>`, then set `search_path`), run the migrations, and drop the schema in `t.Cleanup`. That makes tests safe to run in parallel.

### cards
Q: What does `//go:embed` do?
A: It includes files in the compiled binary at build time, accessible through `embed.FS` (or a string or []byte).
Q: Why is a partial index good for a job queue?
A: It only indexes queued rows, the ones the claim query scans, so it stays small and fast as finished jobs pile up.
Q: How can integration tests share one database safely?
A: Give each test its own schema (or a transaction that's rolled back) and clean it up in `t.Cleanup`.

### quiz
Q: Where do the migration files live at runtime, when the binary uses `embed.FS`?
A: Inside the binary itself. No files need to be shipped alongside it.

### links
- [embed package](https://pkg.go.dev/embed)
- [goose migrations](https://github.com/pressly/goose)
- [PostgreSQL: Partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html)

## Quest: Leases, visibility timeouts, and at-least-once
id: q26-leases
goal: Recover jobs from crashed workers without ever losing them.
stats: REL 0.6, SYS 0.4
concurrency: true
depends: q25-migrations
terms: lease, visibility timeout, heartbeat, reaper, at-least-once, exactly-once (myth), idempotency key
confusable: q24-postgres-repo

### read: What happens when a worker dies mid-job?
minutes: 15
bloom: analyze
If a worker crashes after claiming a job, the row stays `running` forever unless something reclaims it. The fix is a **lease**: `locked_until = now() + 5m`. A **reaper** requeues any running job whose lease has expired. Long jobs extend their lease with a **heartbeat**.

This gives **at-least-once** delivery: a job may run twice (the worker was slow, not dead), but it is never lost. "Exactly-once" in distributed systems is really at-least-once delivery plus idempotent processing.

### concurrency: Heartbeat and reaper
minutes: 40
sessions: 2
While a job runs, a goroutine extends `locked_until` every `lease/3` and stops when the job ends (no leaks!). A reaper loop requeues jobs whose leases have expired, and dead-letters them if they're out of attempts.

### test: Kill a worker
minutes: 25
Claim a job, then simulate a crash by never completing it. Advance time past the lease (using a SQL `now()` override or a short lease), run the reaper, and assert the job is requeued and gets claimed again.

### cards
Q: What problem does a lease (visibility timeout) solve?
A: Jobs claimed by workers that crashed are automatically made available again after the lease expires.
Q: Why does at-least-once delivery require idempotent handlers?
A: A job can run more than once: after a crash, a slow heartbeat, or a timeout. Repeating it must be safe.
Q: How do long jobs avoid being reaped while they're still running?
A: A heartbeat periodically extends the lease.

### quiz
Q: A worker pauses for a long GC and its lease expires. Another worker claims the job. What now?
A: Both run it. That's why handlers must be idempotent, and why the first worker must check it still holds the lease (for example with a fencing token) before writing the result.

### links
- [Amazon SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)
- [How to do distributed locking (Martin Kleppmann)](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
- [River: a Go job queue on Postgres (reference design)](https://riverqueue.com/docs)

## Boss: Durable queue
id: boss-p6
stats: SYS 0.6, REL 0.4
criteria: go-test-race, coverage>=65
The Phase 6 Gate Trial. Jobs survive a restart. Twenty concurrent workers never double-claim a job. A killed worker's job is reaped and rerun. The Postgres repository passes the same contract suite as the in-memory one.

Paste the output of `go test -tags=integration -race -cover ./...`. It must pass with no `DATA RACE` and coverage of at least 65%.
