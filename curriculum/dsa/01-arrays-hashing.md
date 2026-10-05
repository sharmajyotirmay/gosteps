# Phase 1: Arrays and Hashing

> The patterns behind most "easy" and many "medium" problems: hash lookups, prefix sums, two pointers, and sliding windows.

## Topic: Arrays and hash maps
id: t01-hashing
days: 3
tags: array, hash-table, counting

### pattern
A hash map turns "search the rest of the array" into an O(1) lookup, so many O(n²) pair searches become O(n). Look for these signals: "find two items that…", "has this appeared before?", "group by some key".

```go
func twoSum(nums []int, target int) []int {
    seen := make(map[int]int, len(nums)) // value → index
    for i, n := range nums {
        if j, ok := seen[target-n]; ok {
            return []int{j, i}
        }
        seen[n] = i
    }
    return nil
}
```

Go idioms:
- A set is `map[T]struct{}`.
- To count lowercase letters, a `[26]int` array is faster than a map, and it's comparable, so it works as a map key when grouping anagrams.

### problems
- easy two-sum Two Sum
- easy contains-duplicate Contains Duplicate
- easy valid-anagram Valid Anagram
- easy majority-element Majority Element
- medium group-anagrams Group Anagrams
- medium top-k-frequent-elements Top K Frequent Elements
- medium longest-consecutive-sequence Longest Consecutive Sequence
- medium valid-sudoku Valid Sudoku

### cards
Q: What signal in a problem suggests a hash map?
A: Pair or complement search ("two items that sum to X"), "seen before?", or grouping by a computed key. The map replaces an inner loop with an O(1) lookup.
Q: What's the idiomatic set type in Go?
A: `map[T]struct{}`. The empty struct takes no memory. Check membership with `_, ok := set[x]`.
Q: Why can `[26]int` be a map key but `[]int` can't?
A: Arrays are comparable value types. Slices aren't comparable, so they can't be map keys.

## Topic: Prefix sums
id: t02-prefix
days: 2
tags: prefix-sum

### pattern
Precompute `p[i+1] = p[i] + a[i]`, and any range sum becomes `p[r+1] - p[l]` in O(1). Combine that with a hash map of prefix counts to count subarrays with a given sum:

```go
func subarraySum(nums []int, k int) int {
    count := map[int]int{0: 1} // prefix sum → times seen
    sum, res := 0, 0
    for _, n := range nums {
        sum += n
        res += count[sum-k] // a subarray ending here sums to k
        count[sum]++
    }
    return res
}
```

The same idea works in 2-D for matrix region sums, and with products in "product of array except self".

### problems
- easy range-sum-query-immutable Range Sum Query - Immutable
- easy find-pivot-index Find Pivot Index
- medium subarray-sum-equals-k Subarray Sum Equals K
- medium product-of-array-except-self Product of Array Except Self
- medium continuous-subarray-sum Continuous Subarray Sum
- medium contiguous-array Contiguous Array

### cards
Q: How do you get the sum of `a[l..r]` in O(1)?
A: With a prefix array `p` where `p[i+1] = p[i] + a[i]`: the sum is `p[r+1] - p[l]`.
Q: Why seed the prefix-count map with `{0: 1}` in Subarray Sum Equals K?
A: It counts subarrays that start at index 0. Their prefix sum minus k equals the empty prefix, which is 0.
Q: Prefix sums plus a hash map solve which family of problems?
A: Counting or finding subarrays whose sum (or a sum-derived property like a remainder) matches a target.

## Topic: Two pointers
id: t03-two-pointers
days: 3
tags: two-pointers

### pattern
There are two common shapes.
1. **Opposite ends** on sorted data: move whichever pointer improves the answer.
2. **Read/write pointers** in the same direction: compact or partition an array in place.

```go
func twoSumSorted(nums []int, target int) (int, int) {
    l, r := 0, len(nums)-1
    for l < r {
        switch s := nums[l] + nums[r]; {
        case s == target:
            return l, r
        case s < target:
            l++
        default:
            r--
        }
    }
    return -1, -1
}
```

For 3Sum, sort the array, fix `i`, run two pointers on the rest, and skip equal neighbors to avoid duplicate triples.

### problems
- easy valid-palindrome Valid Palindrome
- easy move-zeroes Move Zeroes
- easy remove-duplicates-from-sorted-array Remove Duplicates from Sorted Array
- medium two-sum-ii-input-array-is-sorted Two Sum II - Input Array Is Sorted
- medium 3sum 3Sum
- medium container-with-most-water Container With Most Water
- medium sort-colors Sort Colors
- hard trapping-rain-water Trapping Rain Water

### cards
Q: Why does the two-pointer approach work on a sorted array for pair sums?
A: If the sum is too small, only moving the left pointer right can increase it. If it's too big, only moving the right pointer left can decrease it. Each step safely discards one candidate.
Q: How do you avoid duplicate triples in 3Sum?
A: Sort first, skip `i` when `nums[i] == nums[i-1]`, and after a match advance `l` and `r` past equal values.
Q: What's the read/write pointer pattern?
A: One pointer scans every element and the other marks where the next kept element goes. Used for in-place filtering, like Move Zeroes and Remove Duplicates.

## Topic: Sliding window
id: t04-sliding-window
days: 2
tags: sliding-window

### pattern
Keep a window `[l, r]`. Expand `r`, and while the window breaks the rule, shrink `l`. Each index enters and leaves once, so the loop is O(n).

```go
func lengthOfLongestSubstring(s string) int {
    last := map[byte]int{}
    best, l := 0, 0
    for r := 0; r < len(s); r++ {
        if i, ok := last[s[r]]; ok && i >= l {
            l = i + 1 // jump past the previous occurrence
        }
        last[s[r]] = r
        best = max(best, r-l+1)
    }
    return best
}
```

Signals: "longest/shortest contiguous subarray or substring such that…". With a fixed size k, slide both ends together.

### problems
- easy best-time-to-buy-and-sell-stock Best Time to Buy and Sell Stock
- medium longest-substring-without-repeating-characters Longest Substring Without Repeating Characters
- medium longest-repeating-character-replacement Longest Repeating Character Replacement
- medium permutation-in-string Permutation in String
- medium minimum-size-subarray-sum Minimum Size Subarray Sum
- medium fruit-into-baskets Fruit Into Baskets
- hard minimum-window-substring Minimum Window Substring

### cards
Q: Why is the variable sliding window O(n) even though it has a nested loop?
A: Each index is added once (when `r` passes it) and removed at most once (when `l` passes it), so total work is about 2n.
Q: What phrase in a problem suggests a sliding window?
A: "Longest/shortest contiguous subarray or substring that satisfies a condition", where the condition can be updated incrementally.
Q: Fixed vs variable window?
A: Fixed size k: move `l` and `r` together. Variable: expand `r` and shrink `l` only while the window is invalid (or valid, for minimum problems).

## Boss: Timed set: arrays and hashing
id: dboss-p1
problems: 4
minutes: 60
Pick four unseen problems from this phase's tags (at least two medium). Start the timer and solve them in Go without hints. You pass with 3 of 4 accepted within 60 minutes.
