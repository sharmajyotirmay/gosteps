# Phase 9: Deployment

> Ship it. Build a small container, run CI on every push, and cut a versioned release.

## Quest: Builds and containers
id: q34-containers
goal: Build a static, versioned binary and package it in a minimal container.
stats: DEP 0.9, SYS 0.1
concurrency: false
depends: q33-load
terms: CGO_ENABLED, cross-compilation, GOOS, GOARCH, -ldflags -X, -trimpath, multi-stage Dockerfile, distroless, health check, 12-factor config
confusable: q25-migrations

### read: Static, reproducible binaries
minutes: 15
bloom: apply
```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags="-s -w -X main.version=$(git describe --tags)" \
  -o bin/jobq ./cmd/jobq
```

- `CGO_ENABLED=0` gives you a static binary with no libc dependency.
- `-trimpath` removes local paths from the binary, which helps reproducibility.
- `-X` sets a string variable at link time. The version variable from Quest 1 pays off here.
- `go version -m bin/jobq` shows the module and VCS information embedded at build time.

### read: A multi-stage Dockerfile
minutes: 15
bloom: apply
```dockerfile
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download                  # cached layer
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /jobq ./cmd/jobq

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /jobq /jobq
EXPOSE 8080
ENTRYPOINT ["/jobq", "serve"]
```

The final image contains only your binary and CA certificates, and it runs as a non-root user. Read config from environment variables (12-factor). Add `/healthz` (the process is alive) and `/readyz` (the database is reachable and not draining) endpoints.

### implement: Dockerize jobq
minutes: 35
sessions: 2
Write the Dockerfile and a `compose.yaml` with Postgres. Add `/healthz` and `/readyz`, and make `/readyz` return 503 during shutdown so load balancers stop sending traffic.

### test: Smoke test the container
minutes: 20
Run `docker compose up -d`, then `curl -f localhost:8080/readyz`, POST a job, and poll until it succeeds. Script this as `make smoke`.

### cards
Q: What does `CGO_ENABLED=0` give you?
A: A statically linked binary with no C toolchain or libc dependency, which runs on scratch or distroless images.
Q: How do you inject a version string at build time?
A: `-ldflags "-X main.version=v1.2.3"` on a package-level string variable.
Q: `/healthz` vs `/readyz`?
A: healthz: the process is alive (restart it if not). readyz: it can serve traffic now (don't route to it if not, for example during a drain).

### quiz
Q: Why copy `go.mod` and `go.sum` and run `go mod download` before `COPY . .`?
A: Docker caches that layer, so dependencies are only re-downloaded when go.mod or go.sum change, not on every code edit.

### links
- [Build and deploy Go with Docker](https://docs.docker.com/guides/golang/)
- [distroless images](https://github.com/GoogleContainerTools/distroless)
- [The Twelve-Factor App: Config](https://12factor.net/config)

## Quest: CI/CD and releases
id: q35-ci-release
goal: Run tests, race checks, linters, and vulnerability scans on every push, and release from tags.
stats: DEP 0.8, TST 0.2
concurrency: false
depends: q34-containers
terms: GitHub Actions, setup-go, matrix, cache, golangci-lint-action, govulncheck, GoReleaser, semantic versioning, tags
confusable: q09-static-analysis

### read: A Go CI workflow
minutes: 15
bloom: apply
```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: dev }
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version-file: go.mod }   # caching is on by default
      - run: go vet ./...
      - run: go test -race -cover -tags=integration ./...
        env: { DATABASE_URL: postgres://postgres:dev@localhost:5432/postgres?sslmode=disable }
      - uses: golangci/golangci-lint-action@v8
      - run: go run golang.org/x/vuln/cmd/govulncheck@latest ./...
```

### read: Releases from tags
minutes: 10
bloom: understand
Use semantic versioning tags (`v1.2.0`). Go modules require the `v` prefix, and a major version ≥ 2 changes the module path (`/v2`). GoReleaser builds binaries for several operating systems, container images, checksums, and a changelog from a single tag push.

### implement: Wire up CI and release
minutes: 35
sessions: 2
Add `.github/workflows/ci.yml` as above, plus a `release.yml` that runs GoReleaser on `v*` tags. Add a status badge to the README.

### test: Break the build on purpose
minutes: 15
Open a PR with a deliberate data race and confirm CI fails on `-race`. Then fix it and see CI go green. Paste the passing `go test -race` output.

### cards
Q: How does `actions/setup-go` pick the Go version from your repo?
A: With `go-version-file: go.mod`.
Q: What changes when a Go module reaches v2?
A: Its module path must end in `/v2`, for example `github.com/you/jobq/v2`.
Q: What does GoReleaser automate?
A: Cross-platform builds, archives, checksums, container images, and release notes, all from a git tag.

### quiz
Q: Why run `-race` in CI when your tests already pass locally?
A: Races are nondeterministic and depend on the machine. CI catches them on every change, and a PR can't be merged with a known race.

### links
- [Building and testing Go (GitHub Docs)](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-go)
- [GoReleaser](https://goreleaser.com/)
- [Go Modules: v2 and beyond](https://go.dev/blog/v2-go-modules)

## Boss: Ship jobq
id: boss-p9
stats: DEP 0.7, SYS 0.3
criteria: go-test-race, github-commit
The final Gate Trial. CI is green on `main`, running vet, race tests with Postgres, lint, and govulncheck. A `v1.0.0` tag produced a GoReleaser release, and the container passes `make smoke`. The README has a runbook: config, health endpoints, metrics, and how to drain.

Paste the output of `go test -race ./...` and link the commit or release on GitHub.
