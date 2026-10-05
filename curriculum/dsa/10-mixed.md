# Phase 10: Mixed Review and Mocks

> No new patterns. Mixed, unlabeled problems train you to *recognize* the pattern, which is the skill interviews actually test.

## Topic: Mixed review: arrays to trees
id: t34-mixed-1
days: 5
tags: array, string, two-pointers, stack, binary-search, tree

### pattern
For a problem with no label, run this checklist out loud:

1. **Restate** the problem and work through two examples by hand, including an edge case.
2. **Brute force** first, and state its complexity. Check the input size to see what's acceptable. n ≤ 10⁵ needs O(n log n) or better.
3. **Match signals to patterns:**

| Signal | Try |
|---|---|
| pair/complement, "seen before" | hash map |
| sorted input, pair sums | two pointers |
| contiguous subarray/substring + condition | sliding window |
| range sums | prefix sums |
| next greater/smaller | monotonic stack |
| sorted + "find", or monotone feasibility | binary search |
| k largest / streaming best | heap |
| all combinations | backtracking |
| dependencies | topological sort |
| optimal over choices with overlap | DP |

4. **Code** it in Go, then **test** the edge cases: empty input, a single element, duplicates, negatives.

### problems
- medium rotate-array Rotate Array
- medium find-all-anagrams-in-a-string Find All Anagrams in a String
- medium asteroid-collision Asteroid Collision
- medium car-pooling Car Pooling
- medium the-number-of-weak-characters-in-the-game The Number of Weak Characters in the Game
- hard first-missing-positive First Missing Positive
- hard sliding-window-median Sliding Window Median

### cards
Q: What input size usually rules out O(n²)?
A: n around 10⁵ or more. Aim for O(n log n) or O(n).
Q: What's the first thing to do with an unfamiliar problem?
A: Restate it and work through small examples by hand, including an edge case, before you choose an approach.
Q: Name three signals for a sliding window.
A: The answer is contiguous, there's a condition that can be updated incrementally as the window changes, and the question asks for the longest, shortest, or a count.

## Topic: Mixed review: graphs to DP
id: t35-mixed-2
days: 5
tags: graph, dynamic-programming, greedy, heap-priority-queue, backtracking

### pattern
The last stretch should feel like real interviews. Each day:
- **A mock:** 2 problems in 45 minutes, no labels, talking through your approach.
- **Redo:** problems from your redo queue (the ones that needed hints).
- **Review:** your pattern cards.

When stuck for 15 minutes, read only the *first hint* or the pattern name, then try again. Log it honestly as "solved with hint", and it will come back in your redo queue.

### problems
- medium jump-game-vii Jump Game VII
- hard maximal-rectangle Maximal Rectangle
- hard trapping-rain-water-ii Trapping Rain Water II
- hard critical-connections-in-a-network Critical Connections in a Network
- hard minimum-cost-to-cut-a-stick Minimum Cost to Cut a Stick

### cards
Q: How long should you stay stuck before taking a hint?
A: About 15 minutes of real effort. Then take the smallest hint (just the pattern name) and try again. Log it as a hint so it gets scheduled for a redo.
Q: Why redo problems you needed hints for?
A: Re-solving without help a few days later is retrieval practice. It turns "I recognized the answer" into "I can produce it".
Q: How does Maximal Rectangle reduce to an earlier problem?
A: Build a histogram of heights row by row and run Largest Rectangle in Histogram (monotonic stack) on each row.

## Boss: Final mock
id: dboss-p10
problems: 4
minutes: 90
The final Gate Trial: four unseen, unlabeled problems (at least one hard), in Go, talking through your approach as you go. You pass with 3 of 4 within 90 minutes.
