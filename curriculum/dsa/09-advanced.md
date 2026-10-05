# Phase 9: Advanced Patterns

> 2-D and interval DP, tries, bit tricks, and design problems that combine several structures.

## Topic: Grid and interval DP
id: t30-dp-2d
days: 3
tags: dynamic-programming, memoization

### pattern
**Grid DP:** `dp[r][c]` is built from the cell above and the cell to the left. Often a single row is enough:

```go
func uniquePaths(m, n int) int {
    row := make([]int, n)
    for c := range row {
        row[c] = 1
    }
    for r := 1; r < m; r++ {
        for c := 1; c < n; c++ {
            row[c] += row[c-1] // above + left
        }
    }
    return row[n-1]
}
```

**Interval DP:** `dp[l][r]` combines answers for sub-intervals. Iterate by increasing length. In Burst Balloons, choose which balloon bursts *last* in `(l, r)`.

**State machines:** for stock problems with cooldown, use states held / sold / rested, each updated from the previous day.

### problems
- medium unique-paths Unique Paths
- medium unique-paths-ii Unique Paths II
- medium minimum-path-sum Minimum Path Sum
- medium triangle Triangle
- medium maximal-square Maximal Square
- medium best-time-to-buy-and-sell-stock-with-cooldown Best Time to Buy and Sell Stock with Cooldown
- hard burst-balloons Burst Balloons
- hard regular-expression-matching Regular Expression Matching

### cards
Q: How do you reduce grid DP to O(n) space?
A: Keep one row. `row[c]` still holds the value from above, and `row[c-1]` is already updated for the current row (the cell to the left).
Q: In interval DP, why iterate by interval length?
A: `dp[l][r]` depends on strictly shorter sub-intervals, so shorter lengths must be computed first.
Q: In Burst Balloons, why choose the balloon that bursts *last*?
A: If `k` bursts last in `(l, r)`, its neighbors at that moment are exactly `l` and `r`, so the two sides become independent subproblems.

## Topic: Tries
id: t31-tries
days: 2
tags: trie

### pattern
A trie shares prefixes between words. Each node has up to 26 children and an end-of-word flag:

```go
type Trie struct {
    next [26]*Trie
    end  bool
}

func (t *Trie) Insert(w string) {
    n := t
    for i := 0; i < len(w); i++ {
        c := w[i] - 'a'
        if n.next[c] == nil {
            n.next[c] = &Trie{}
        }
        n = n.next[c]
    }
    n.end = true
}

func (t *Trie) StartsWith(p string) bool {
    n := t
    for i := 0; i < len(p); i++ {
        if n = n.next[p[i]-'a']; n == nil {
            return false
        }
    }
    return true
}
```

For Word Search II, insert all the words into a trie and run a single DFS over the board, pruning as soon as the current path isn't a prefix.

### problems
- medium implement-trie-prefix-tree Implement Trie (Prefix Tree)
- medium design-add-and-search-words-data-structure Design Add and Search Words Data Structure
- medium replace-words Replace Words
- medium longest-word-in-dictionary Longest Word in Dictionary
- medium search-suggestions-system Search Suggestions System
- medium maximum-xor-of-two-numbers-in-an-array Maximum XOR of Two Numbers in an Array
- hard word-search-ii Word Search II

### cards
Q: What's the time complexity of trie insert and search?
A: O(L), where L is the word length, regardless of how many words are stored.
Q: Why use a trie for Word Search II instead of searching each word separately?
A: One DFS over the board checks all the words at once, and paths that aren't a prefix of any word are pruned immediately.
Q: How does a binary trie solve Maximum XOR?
A: Insert the numbers bit by bit from the highest bit. For each number, greedily walk the opposite bit whenever it exists.

## Topic: Bit manipulation and math
id: t32-bits-math
days: 3
tags: bit-manipulation, math

### pattern
Know these by heart:
- `x & (x-1)` clears the lowest set bit.
- `x & -x` isolates the lowest set bit.
- `a ^ a = 0` and `a ^ 0 = a`, so XOR cancels pairs.
- `bits.OnesCount(uint(x))` is the popcount (`math/bits`).

```go
func singleNumber(nums []int) int {
    x := 0
    for _, n := range nums {
        x ^= n // pairs cancel, the single number remains
    }
    return x
}
```

For math problems, watch for overflow (`math.MaxInt32` limits in the problem statement), and use `big.Int` only when the problem really needs it.

### problems
- easy single-number Single Number
- easy number-of-1-bits Number of 1 Bits
- easy counting-bits Counting Bits
- easy reverse-bits Reverse Bits
- easy missing-number Missing Number
- easy power-of-two Power of Two
- medium single-number-ii Single Number II
- medium sum-of-two-integers Sum of Two Integers
- medium reverse-integer Reverse Integer
- medium multiply-strings Multiply Strings
- medium count-primes Count Primes

### cards
Q: What does `x & (x-1)` do?
A: It clears the lowest set bit. `x & (x-1) == 0` means x is a power of two (for x > 0).
Q: Why does XOR find the single number?
A: XOR is associative and commutative, `a ^ a = 0`, and `a ^ 0 = a`, so every pair cancels out.
Q: Counting Bits in O(n)?
A: `bits[i] = bits[i>>1] + (i & 1)`. Reuse the count of `i` without its lowest bit.

## Topic: Design problems
id: t33-design
days: 2
tags: design

### pattern
Design problems combine structures so that every operation hits its complexity target. Write down each operation's required cost first, then pick structures.

- **LRU cache:** hash map + doubly linked list. `container/list` provides the list.
- **O(1) insert/delete/getRandom:** slice + value→index map. Delete by swapping with the last element.
- **Snapshots or versions:** per-key sorted history + binary search.

```go
type LRUCache struct {
    cap int
    ll  *list.List               // front = most recent
    m   map[int]*list.Element    // key → element holding [2]int{key, val}
}

func (c *LRUCache) Get(k int) int {
    if e, ok := c.m[k]; ok {
        c.ll.MoveToFront(e)
        return e.Value.([2]int)[1]
    }
    return -1
}
```

### problems
- medium lru-cache LRU Cache
- medium insert-delete-getrandom-o1 Insert Delete GetRandom O(1)
- medium design-browser-history Design Browser History
- medium snapshot-array Snapshot Array
- medium design-underground-system Design Underground System
- medium stock-price-fluctuation Stock Price Fluctuation
- hard lfu-cache LFU Cache
- hard all-oone-data-structure All O`one Data Structure

### cards
Q: Which two structures make an LRU cache O(1)?
A: A hash map (key → list node) for lookup, and a doubly linked list for recency order with O(1) move-to-front and evict-from-back.
Q: How does Insert Delete GetRandom delete in O(1)?
A: Swap the element with the last one in the slice, update the moved element's index in the map, then truncate the slice.
Q: What's the first step in any design problem?
A: List each operation with its required time complexity, then choose structures that meet all of them together.

## Boss: Timed set: advanced
id: dboss-p9
problems: 4
minutes: 75
Four unseen problems: one grid DP, one trie, one bit manipulation, and one design. You pass with 3 of 4 within 75 minutes.
