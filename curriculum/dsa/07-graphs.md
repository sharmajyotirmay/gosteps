# Phase 7: Graphs

> Model the problem as nodes and edges, then traverse it, order it, connect it, or find shortest paths through it.

## Topic: Graph and grid traversal
id: t23-graph-traversal
days: 3
tags: graph, depth-first-search, breadth-first-search

### pattern
Build an adjacency list, keep a `visited` set, and run DFS or BFS from every unvisited node to count components. A grid is a graph whose edges are the four neighbors of each cell:

```go
func numIslands(grid [][]byte) int {
    var sink func(r, c int)
    sink = func(r, c int) {
        if r < 0 || c < 0 || r >= len(grid) || c >= len(grid[0]) || grid[r][c] != '1' {
            return
        }
        grid[r][c] = '0' // visited
        sink(r+1, c); sink(r-1, c); sink(r, c+1); sink(r, c-1)
    }
    count := 0
    for r := range grid {
        for c := range grid[0] {
            if grid[r][c] == '1' {
                count++
                sink(r, c)
            }
        }
    }
    return count
}
```

**Multi-source BFS** (Rotting Oranges) starts with every source in the queue at distance 0. "Reverse" thinking helps too: Pacific Atlantic flows inward from the oceans.

### problems
- easy flood-fill Flood Fill
- easy find-if-path-exists-in-graph Find if Path Exists in Graph
- medium number-of-islands Number of Islands
- medium max-area-of-island Max Area of Island
- medium clone-graph Clone Graph
- medium rotting-oranges Rotting Oranges
- medium pacific-atlantic-water-flow Pacific Atlantic Water Flow
- medium surrounded-regions Surrounded Regions

### cards
Q: How do you count connected components?
A: Loop over all nodes. For each unvisited one, increment the count and DFS or BFS to mark its whole component as visited.
Q: What is multi-source BFS?
A: Start the queue with all sources at distance 0. BFS then gives each cell its distance to the *nearest* source in a single pass.
Q: DFS recursion depth on a 1000×1000 grid: is it a problem in Go?
A: Usually not. Goroutine stacks grow dynamically (up to 1 GB by default), unlike fixed-stack languages. Iterative BFS is still safer for huge inputs.

## Topic: Topological sort
id: t24-topo-sort
days: 2
tags: topological-sort

### pattern
Kahn's algorithm: repeatedly take the nodes with in-degree 0. If some nodes never reach 0, there's a cycle.

```go
func canFinish(n int, prereq [][]int) bool {
    adj := make([][]int, n)
    indeg := make([]int, n)
    for _, p := range prereq {
        adj[p[1]] = append(adj[p[1]], p[0])
        indeg[p[0]]++
    }
    var q []int
    for i, d := range indeg {
        if d == 0 { q = append(q, i) }
    }
    done := 0
    for len(q) > 0 {
        u := q[0]; q = q[1:]
        done++
        for _, v := range adj[u] {
            if indeg[v]--; indeg[v] == 0 { q = append(q, v) }
        }
    }
    return done == n
}
```

Signals: prerequisites, build order, dependency resolution, "is there a valid order?"

### problems
- medium course-schedule Course Schedule
- medium course-schedule-ii Course Schedule II
- medium find-eventual-safe-states Find Eventual Safe States
- medium minimum-height-trees Minimum Height Trees
- hard parallel-courses-iii Parallel Courses III
- hard longest-increasing-path-in-a-matrix Longest Increasing Path in a Matrix

### cards
Q: How does Kahn's algorithm detect a cycle?
A: If fewer than n nodes are processed (some never reach in-degree 0), the remaining nodes form or depend on a cycle.
Q: What's the alternative DFS approach to topological sort?
A: Post-order DFS with three colors (unvisited, visiting, done), then reverse the post-order. Reaching a "visiting" node means there's a cycle.
Q: Which real problem is topological sort?
A: Dependency ordering: build systems, course prerequisites, package installs (like `go mod` resolving the module graph).

## Topic: Union-find
id: t25-union-find
days: 2
tags: union-find

### pattern
Union-find (disjoint set) answers "are these connected?" while you add edges, in near-constant amortized time:

```go
type DSU struct{ parent, size []int }

func NewDSU(n int) *DSU {
    d := &DSU{make([]int, n), make([]int, n)}
    for i := range n { d.parent[i], d.size[i] = i, 1 }
    return d
}
func (d *DSU) Find(x int) int {
    for d.parent[x] != x {
        d.parent[x] = d.parent[d.parent[x]] // path halving
        x = d.parent[x]
    }
    return x
}
func (d *DSU) Union(a, b int) bool {
    a, b = d.Find(a), d.Find(b)
    if a == b { return false } // already connected: this edge closes a cycle
    if d.size[a] < d.size[b] { a, b = b, a }
    d.parent[b] = a
    d.size[a] += d.size[b]
    return true
}
```

### problems
- medium redundant-connection Redundant Connection
- medium number-of-provinces Number of Provinces
- medium accounts-merge Accounts Merge
- medium satisfiability-of-equality-equations Satisfiability of Equality Equations
- medium most-stones-removed-with-same-row-or-column Most Stones Removed with Same Row or Column
- medium number-of-operations-to-make-network-connected Number of Operations to Make Network Connected

### cards
Q: What two optimizations make union-find nearly O(1)?
A: Path compression (or halving) in Find, and union by size or rank. Together they give O(α(n)), the inverse Ackermann function.
Q: How does union-find detect a redundant edge?
A: `Union(a, b)` returns false when a and b already share a root, so adding that edge would close a cycle.
Q: Union-find or BFS for connected components?
A: Both work for a static graph. Union-find shines when edges arrive incrementally and you need connectivity answers along the way.

## Topic: Shortest paths and spanning trees
id: t26-shortest-paths
days: 3
tags: shortest-path, graph

### pattern
- Unweighted graph: BFS.
- Non-negative weights: **Dijkstra** with a min-heap.
- "At most k edges": Bellman-Ford limited to k rounds.
- Minimum spanning tree: Prim's (heap) or Kruskal's (sort edges + union-find).

```go
type item struct{ node, dist int }
type pq []item
func (h pq) Len() int            { return len(h) }
func (h pq) Less(i, j int) bool  { return h[i].dist < h[j].dist }
func (h pq) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *pq) Push(x any)         { *h = append(*h, x.(item)) }
func (h *pq) Pop() any           { o := *h; x := o[len(o)-1]; *h = o[:len(o)-1]; return x }

func dijkstra(adj [][]item, src int) []int {
    dist := make([]int, len(adj))
    for i := range dist { dist[i] = math.MaxInt }
    dist[src] = 0
    h := &pq{{src, 0}}
    for h.Len() > 0 {
        cur := heap.Pop(h).(item)
        if cur.dist > dist[cur.node] { continue } // stale entry
        for _, e := range adj[cur.node] {
            if nd := cur.dist + e.dist; nd < dist[e.node] {
                dist[e.node] = nd
                heap.Push(h, item{e.node, nd})
            }
        }
    }
    return dist
}
```

### problems
- medium network-delay-time Network Delay Time
- medium path-with-minimum-effort Path With Minimum Effort
- medium cheapest-flights-within-k-stops Cheapest Flights Within K Stops
- medium shortest-path-in-binary-matrix Shortest Path in Binary Matrix
- medium min-cost-to-connect-all-points Min Cost to Connect All Points
- hard swim-in-rising-water Swim in Rising Water
- hard word-ladder Word Ladder
- hard reconstruct-itinerary Reconstruct Itinerary

### cards
Q: Why does Dijkstra fail with negative edge weights?
A: It finalizes a node when it's popped, assuming no later path can be shorter. A negative edge can break that assumption.
Q: Why skip heap entries where `cur.dist > dist[node]`?
A: They're stale: a shorter path was found after they were pushed. This "lazy deletion" replaces a decrease-key operation.
Q: Prim's vs Kruskal's for a minimum spanning tree?
A: Prim's grows one tree using a heap (good for dense graphs). Kruskal's sorts all edges and adds them with union-find (good for sparse graphs).

## Boss: Timed set: graphs
id: dboss-p7
problems: 4
minutes: 75
Four unseen graph problems: traversal, topological sort or union-find, and shortest path. You pass with 3 of 4 within 75 minutes.
