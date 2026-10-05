# Phase 3: Binary Search and Sorting

> Halve the search space: on arrays, then on the answer itself. Sort with comparators, and walk matrices.

## Topic: Binary search on arrays
id: t09-binary-search
days: 3
tags: binary-search

### pattern
Pick one invariant and keep it. The half-open form `[lo, hi)` finds the **first index where a predicate becomes true**:

```go
// first index i with nums[i] >= target (len(nums) if none)
func lowerBound(nums []int, target int) int {
    lo, hi := 0, len(nums)
    for lo < hi {
        mid := lo + (hi-lo)/2
        if nums[mid] >= target {
            hi = mid
        } else {
            lo = mid + 1
        }
    }
    return lo
}
```

The standard library has `slices.BinarySearch(s, x)` and `sort.Search(n, pred)`. For a rotated array, one half is always sorted: check whether the target lies in that half.

### problems
- easy binary-search Binary Search
- easy search-insert-position Search Insert Position
- medium search-a-2d-matrix Search a 2D Matrix
- medium find-first-and-last-position-of-element-in-sorted-array Find First and Last Position of Element in Sorted Array
- medium find-minimum-in-rotated-sorted-array Find Minimum in Rotated Sorted Array
- medium search-in-rotated-sorted-array Search in Rotated Sorted Array
- medium find-peak-element Find Peak Element
- medium time-based-key-value-store Time Based Key-Value Store

### cards
Q: Why write `mid := lo + (hi-lo)/2`?
A: It avoids integer overflow from `lo+hi` in fixed-width languages. In Go, `int` is 64-bit, but the habit is still correct.
Q: What does the `[lo, hi)` lower-bound loop return?
A: The first index where the predicate is true, or `len` if it's never true. It never needs a separate `found` check.
Q: In a rotated sorted array, how do you know which half to search?
A: Compare `nums[lo]` with `nums[mid]`. If `nums[lo] <= nums[mid]`, the left half is sorted. Check whether the target lies within that sorted half's range.

## Topic: Binary search on the answer
id: t10-search-answer
days: 3
tags: binary-search

### pattern
When the answer is a number in `[lo, hi]` and "is `x` feasible?" is **monotone** (false, false, true, true…), binary search the answer and test feasibility in O(n).

```go
func minEatingSpeed(piles []int, h int) int {
    lo, hi := 1, slices.Max(piles)
    for lo < hi {
        k := lo + (hi-lo)/2
        hours := 0
        for _, p := range piles {
            hours += (p + k - 1) / k // ceil(p/k)
        }
        if hours <= h {
            hi = k // k works; try smaller
        } else {
            lo = k + 1
        }
    }
    return lo
}
```

Signals: "minimum possible maximum", "smallest capacity or speed such that…".

### problems
- easy sqrtx Sqrt(x)
- medium koko-eating-bananas Koko Eating Bananas
- medium capacity-to-ship-packages-within-d-days Capacity To Ship Packages Within D Days
- medium minimum-number-of-days-to-make-m-bouquets Minimum Number of Days to Make m Bouquets
- hard split-array-largest-sum Split Array Largest Sum
- hard median-of-two-sorted-arrays Median of Two Sorted Arrays

### cards
Q: When can you binary search on the answer?
A: When feasibility is monotone in the answer: if `x` works, every larger (or smaller) value also works, and you can check one candidate efficiently.
Q: How do you compute ceil(p/k) with integers?
A: `(p + k - 1) / k` for positive values.
Q: What phrase in a problem hints at binary search on the answer?
A: "Minimize the maximum" or "maximize the minimum", or "smallest speed/capacity/days such that a condition holds".

## Topic: Sorting and comparators
id: t11-sorting
days: 2
tags: sorting

### pattern
Sorting is often a preprocessing step that unlocks two pointers, greedy choices, or merging. In Go 1.21+:

```go
slices.SortFunc(people, func(a, b Person) int {
    if c := cmp.Compare(a.Age, b.Age); c != 0 {
        return c
    }
    return strings.Compare(a.Name, b.Name) // tie-break
})
```

Use `slices.SortStableFunc` when the order of equal elements matters. Know quickselect (average O(n) for the k-th element) and counting sort (for a small value range).

### problems
- easy squares-of-a-sorted-array Squares of a Sorted Array
- easy relative-sort-array Relative Sort Array
- medium sort-an-array Sort an Array
- medium sort-characters-by-frequency Sort Characters By Frequency
- medium largest-number Largest Number
- medium h-index H-Index
- medium kth-largest-element-in-an-array Kth Largest Element in an Array

### cards
Q: What does a Go comparator for `slices.SortFunc` return?
A: A negative number if a < b, zero if they're equal, and a positive number if a > b. `cmp.Compare` produces exactly that.
Q: When do you need a stable sort?
A: When equal elements must keep their original relative order, for example after an earlier sort by a secondary key.
Q: What's the expected and worst-case time of quickselect?
A: O(n) expected and O(n²) worst case. Random pivots make the worst case unlikely.

## Topic: Matrix and simulation
id: t12-matrix
days: 2
tags: matrix, simulation

### pattern
Use a direction table and bounds checks instead of four copies of the same code:

```go
var dirs = [4][2]int{{0, 1}, {1, 0}, {0, -1}, {-1, 0}} // right, down, left, up

func inBounds(g [][]int, r, c int) bool {
    return r >= 0 && r < len(g) && c >= 0 && c < len(g[0])
}
```

To rotate 90° clockwise in place, transpose and then reverse each row. To update in place without extra memory, encode the old and new state in the same cell (for example, with an extra bit).

### problems
- easy transpose-matrix Transpose Matrix
- easy plus-one Plus One
- easy happy-number Happy Number
- medium rotate-image Rotate Image
- medium spiral-matrix Spiral Matrix
- medium set-matrix-zeroes Set Matrix Zeroes
- medium game-of-life Game of Life

### cards
Q: How do you rotate an n×n matrix 90° clockwise in place?
A: Transpose it (swap `m[i][j]` with `m[j][i]` for `j > i`), then reverse each row.
Q: How do you update a grid in place when new values depend on old neighbors?
A: Encode both states in one cell (for example, bit 0 holds the old value and bit 1 the new one), then finish with a second pass.
Q: Why use a directions array?
A: It replaces four near-identical blocks with a single loop, which removes copy-paste bugs.

## Boss: Timed set: search and sort
id: dboss-p3
problems: 4
minutes: 60
Four unseen problems, including at least one "binary search on the answer". You pass with 3 of 4 within 60 minutes.
