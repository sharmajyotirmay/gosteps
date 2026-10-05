# Phase 5: Heaps, Intervals, and Greedy

> Always know the best candidate (heaps), sort and sweep (intervals), and make the locally right choice and prove it (greedy).

## Topic: Heaps and priority queues
id: t17-heaps
days: 3
tags: heap-priority-queue

### pattern
`container/heap` turns any slice type with five methods into a min-heap:

```go
type IntHeap []int

func (h IntHeap) Len() int           { return len(h) }
func (h IntHeap) Less(i, j int) bool { return h[i] < h[j] } // min-heap
func (h IntHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *IntHeap) Push(x any)        { *h = append(*h, x.(int)) }
func (h *IntHeap) Pop() any {
    old := *h
    x := old[len(old)-1]
    *h = old[:len(old)-1]
    return x
}

// k-th largest: keep a min-heap of size k
func findKthLargest(nums []int, k int) int {
    h := &IntHeap{}
    for _, n := range nums {
        heap.Push(h, n)
        if h.Len() > k {
            heap.Pop(h)
        }
    }
    return (*h)[0]
}
```

**Top-k largest uses a min-heap of size k**, so the smallest of the top k is always on top, ready to be evicted. Two heaps (a max-heap for the lower half and a min-heap for the upper half) give a running median.

### problems
- easy kth-largest-element-in-a-stream Kth Largest Element in a Stream
- easy last-stone-weight Last Stone Weight
- medium k-closest-points-to-origin K Closest Points to Origin
- medium top-k-frequent-words Top K Frequent Words
- medium task-scheduler Task Scheduler
- medium design-twitter Design Twitter
- hard find-median-from-data-stream Find Median from Data Stream
- hard merge-k-sorted-lists Merge k Sorted Lists

### cards
Q: Why does "k largest" use a *min*-heap of size k?
A: The heap's top is the smallest of the k largest seen so far, so any new element bigger than it replaces it in O(log k).
Q: Which five methods does `container/heap` need?
A: Len, Less, Swap (from sort.Interface), plus Push(any) and Pop() any on a pointer receiver.
Q: How do two heaps maintain a running median?
A: A max-heap holds the lower half and a min-heap the upper half, with sizes differing by at most 1. The median comes from the top of one or both.

## Topic: Intervals
id: t18-intervals
days: 3
tags: sorting, line-sweep

### pattern
Sort by start. Then each interval either overlaps the last merged one (extend it) or starts a new one:

```go
func merge(iv [][]int) [][]int {
    slices.SortFunc(iv, func(a, b []int) int { return cmp.Compare(a[0], b[0]) })
    var res [][]int
    for _, x := range iv {
        if n := len(res); n > 0 && x[0] <= res[n-1][1] {
            res[n-1][1] = max(res[n-1][1], x[1])
        } else {
            res = append(res, x)
        }
    }
    return res
}
```

To keep the maximum number of non-overlapping intervals, sort by **end** and greedily keep whichever finishes first. To count overlap at any moment, use a sweep over +1/-1 events.

### problems
- easy summary-ranges Summary Ranges
- medium merge-intervals Merge Intervals
- medium insert-interval Insert Interval
- medium non-overlapping-intervals Non-overlapping Intervals
- medium minimum-number-of-arrows-to-burst-balloons Minimum Number of Arrows to Burst Balloons
- medium interval-list-intersections Interval List Intersections
- medium my-calendar-i My Calendar I
- hard minimum-interval-to-include-each-query Minimum Interval to Include Each Query

### cards
Q: Sort intervals by start or by end?
A: By start to merge or insert. By end to maximize non-overlapping intervals or minimize removals (greedy "finish first").
Q: When do `[a,b]` and `[c,d]` overlap, given that `a <= c`?
A: When `c <= b`. Check whether the problem treats touching endpoints as overlapping.
Q: What's a line sweep?
A: Turn each interval into events (+1 at start, -1 at end), sort the events, and scan them while tracking the running count.

## Topic: Greedy
id: t19-greedy
days: 4
tags: greedy

### pattern
A greedy algorithm makes the locally best choice and never revisits it. It's correct only if you can argue that **some optimal solution starts with that choice** (an exchange argument). Try small counterexamples before you commit.

```go
func canJump(nums []int) bool {
    reach := 0
    for i, n := range nums {
        if i > reach {
            return false // can't even get here
        }
        reach = max(reach, i+n)
    }
    return true
}
```

Kadane's algorithm (Maximum Subarray) is greedy too: drop the running sum once it goes negative.

### problems
- easy assign-cookies Assign Cookies
- easy lemonade-change Lemonade Change
- medium maximum-subarray Maximum Subarray
- medium jump-game Jump Game
- medium jump-game-ii Jump Game II
- medium gas-station Gas Station
- medium hand-of-straights Hand of Straights
- medium merge-triplets-to-form-target-triplet Merge Triplets to Form Target Triplet
- medium partition-labels Partition Labels
- medium valid-parenthesis-string Valid Parenthesis String
- hard candy Candy

### cards
Q: How do you justify a greedy choice?
A: With an exchange argument: take any optimal solution, swap in the greedy choice, and show the result is no worse.
Q: State Kadane's algorithm in one line.
A: `cur = max(x, cur + x)` and `best = max(best, cur)`. Start a new subarray whenever extending the current one would hurt.
Q: Why does Gas Station restart from `i+1` when the tank goes negative?
A: No station between the old start and `i` can be a valid start either, because each would arrive at `i` with even less fuel.

## Boss: Timed set: heaps, intervals, and greedy
id: dboss-p5
problems: 4
minutes: 60
Four unseen problems: one heap, one interval, and two greedy. You pass with 3 of 4 within 60 minutes, and you must be able to explain why each greedy choice is safe.
