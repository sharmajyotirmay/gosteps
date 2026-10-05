# Phase 6: Recursion and Backtracking

> Break problems into smaller copies of themselves, then explore choice trees systematically and prune early.

## Topic: Recursion and divide and conquer
id: t20-recursion
days: 3
tags: recursion, divide-and-conquer

### pattern
Write the base case, then assume the recursive call works on a smaller input. Divide and conquer splits the input, solves the halves, and combines them:

```go
func myPow(x float64, n int) float64 {
    if n < 0 {
        return 1 / myPow(x, -n)
    }
    if n == 0 {
        return 1
    }
    half := myPow(x, n/2) // O(log n)
    if n%2 == 0 {
        return half * half
    }
    return half * half * x
}
```

Merge sort is the classic example: split, sort both halves, then merge in O(n), giving O(n log n) overall. Counting inversions is merge sort with a counter added.

### problems
- easy fibonacci-number Fibonacci Number
- medium powx-n Pow(x, n)
- medium sort-list Sort List
- medium k-th-symbol-in-grammar K-th Symbol in Grammar
- medium different-ways-to-add-parentheses Different Ways to Add Parentheses
- medium maximum-binary-tree Maximum Binary Tree
- medium search-a-2d-matrix-ii Search a 2D Matrix II
- hard count-of-smaller-numbers-after-self Count of Smaller Numbers After Self

### cards
Q: What are the two parts of every recursive function?
A: A base case that stops it, and a recursive case that makes the input strictly smaller.
Q: Why is fast exponentiation O(log n)?
A: Each call halves `n` and reuses one result (`half * half`) instead of recursing twice.
Q: What's the recurrence for merge sort, and what does it solve to?
A: T(n) = 2T(n/2) + O(n), which is O(n log n).

## Topic: Subsets, permutations, and combinations
id: t21-subsets
days: 4
tags: backtracking

### pattern
Backtracking is choose → explore → un-choose:

```go
func subsets(nums []int) [][]int {
    var res [][]int
    var cur []int
    var dfs func(i int)
    dfs = func(i int) {
        if i == len(nums) {
            res = append(res, slices.Clone(cur)) // copy! cur keeps changing
            return
        }
        cur = append(cur, nums[i]) // choose
        dfs(i + 1)
        cur = cur[:len(cur)-1] // un-choose
        dfs(i + 1)             // skip
    }
    dfs(0)
    return res
}
```

**Go gotcha:** appending `cur` without cloning it stores a slice that shares the backing array, so later changes corrupt your results. With duplicate inputs, sort first and skip `nums[i] == nums[i-1]` at the same depth.

### problems
- medium subsets Subsets
- medium subsets-ii Subsets II
- medium permutations Permutations
- medium permutations-ii Permutations II
- medium combinations Combinations
- medium combination-sum Combination Sum
- medium combination-sum-ii Combination Sum II
- medium letter-combinations-of-a-phone-number Letter Combinations of a Phone Number
- medium palindrome-partitioning Palindrome Partitioning

### cards
Q: Why must you `slices.Clone(cur)` before saving a backtracking result in Go?
A: `cur` shares its backing array with every saved slice, so later appends and truncations overwrite the "saved" results.
Q: How do you avoid duplicate subsets when the input has duplicates?
A: Sort the input, and at each depth skip `nums[i]` if `i > start && nums[i] == nums[i-1]`.
Q: How many subsets and permutations does a set of n items have?
A: 2ⁿ subsets and n! permutations. That's why these problems have small input limits.

## Topic: Constraint and grid backtracking
id: t22-constraint
days: 3
tags: backtracking, matrix

### pattern
Prune as early as possible: check the constraints *before* recursing. On grids, mark a cell as visited in place and restore it afterwards:

```go
func exist(board [][]byte, word string) bool {
    var dfs func(r, c, i int) bool
    dfs = func(r, c, i int) bool {
        if i == len(word) {
            return true
        }
        if r < 0 || c < 0 || r >= len(board) || c >= len(board[0]) || board[r][c] != word[i] {
            return false
        }
        tmp := board[r][c]
        board[r][c] = '#' // mark visited
        found := dfs(r+1, c, i+1) || dfs(r-1, c, i+1) || dfs(r, c+1, i+1) || dfs(r, c-1, i+1)
        board[r][c] = tmp // restore
        return found
    }
    for r := range board {
        for c := range board[0] {
            if dfs(r, c, 0) {
                return true
            }
        }
    }
    return false
}
```

For N-Queens, track used columns and both diagonals (`r+c` and `r-c`) in sets, so each check is O(1).

### problems
- medium word-search Word Search
- medium restore-ip-addresses Restore IP Addresses
- medium matchsticks-to-square Matchsticks to Square
- medium partition-to-k-equal-sum-subsets Partition to K Equal Sum Subsets
- hard n-queens N-Queens
- hard n-queens-ii N-Queens II
- hard sudoku-solver Sudoku Solver

### cards
Q: How do you mark a grid cell as visited without a separate visited array?
A: Overwrite it with a sentinel before recursing and restore the original value afterwards.
Q: How does N-Queens check diagonals in O(1)?
A: Cells on the same "\" diagonal share `r - c`, and cells on the same "/" diagonal share `r + c`. Keep a set for each.
Q: What's the single most important backtracking optimization?
A: Prune early: reject a partial choice as soon as it can't lead to a valid solution, before recursing.

## Boss: Timed set: backtracking
id: dboss-p6
problems: 4
minutes: 75
Four unseen backtracking or recursion problems (one may be hard). You pass with 3 of 4 within 75 minutes.
