# Phase 2: Stacks, Queues, and Linked Lists

> Linear structures with a twist: matching, "next greater" questions, pointer surgery, and deques.

## Topic: Stacks
id: t05-stacks
days: 3
tags: stack

### pattern
A Go slice is a stack: push with `append`, pop with `s = s[:len(s)-1]`. Use a stack when the most recent unmatched thing decides what happens next: brackets, undo, nested decoding, expression evaluation.

```go
func isValid(s string) bool {
    pair := map[rune]rune{')': '(', ']': '[', '}': '{'}
    var st []rune
    for _, c := range s {
        if open, ok := pair[c]; ok {
            if len(st) == 0 || st[len(st)-1] != open {
                return false
            }
            st = st[:len(st)-1]
        } else {
            st = append(st, c)
        }
    }
    return len(st) == 0
}
```

### problems
- easy valid-parentheses Valid Parentheses
- easy backspace-string-compare Backspace String Compare
- medium min-stack Min Stack
- medium evaluate-reverse-polish-notation Evaluate Reverse Polish Notation
- medium generate-parentheses Generate Parentheses
- medium decode-string Decode String
- medium simplify-path Simplify Path

### cards
Q: How do you push and pop with a Go slice?
A: Push: `st = append(st, x)`. Pop: `x := st[len(st)-1]; st = st[:len(st)-1]`. Check `len(st) > 0` first.
Q: How does Min Stack return the minimum in O(1)?
A: Each entry also stores the minimum at the time it was pushed (or a second stack tracks minimums), so the top always knows the current min.
Q: What problem shape signals a stack?
A: The latest unmatched or unfinished item decides the next action: matching brackets, nested structures, undo, or evaluating postfix expressions.

## Topic: Monotonic stack
id: t06-monotonic-stack
days: 2
tags: monotonic-stack

### pattern
Keep indices in the stack so that their values stay in decreasing order. When a bigger value arrives, it's the "next greater element" for everything it pops.

```go
func dailyTemperatures(t []int) []int {
    res := make([]int, len(t))
    var st []int // indices, temperatures decreasing
    for i, x := range t {
        for len(st) > 0 && t[st[len(st)-1]] < x {
            j := st[len(st)-1]
            st = st[:len(st)-1]
            res[j] = i - j
        }
        st = append(st, i)
    }
    return res
}
```

Each index is pushed and popped once, so this is O(n). Largest Rectangle in Histogram uses an increasing stack, and the pop computes the area bounded by the popped bar.

### problems
- easy next-greater-element-i Next Greater Element I
- medium daily-temperatures Daily Temperatures
- medium next-greater-element-ii Next Greater Element II
- medium online-stock-span Online Stock Span
- medium car-fleet Car Fleet
- medium remove-k-digits Remove K Digits
- hard largest-rectangle-in-histogram Largest Rectangle in Histogram

### cards
Q: What question does a monotonic decreasing stack answer?
A: For each element, the next (or previous) greater element. Popping happens exactly when that answer is found.
Q: Why push indices instead of values?
A: You usually need distances or positions (days until warmer, rectangle width), and you can always look up the value from the index.
Q: How do you handle circular arrays, as in Next Greater Element II?
A: Iterate `2n` times using `i % n`, and only push during the first pass.

## Topic: Linked lists
id: t07-linked-lists
days: 3
tags: linked-list

### pattern
Three tools cover most list problems.
1. **A dummy head** removes edge cases at the front.
2. **Fast and slow pointers** find the middle, detect cycles, or find the nth node from the end.
3. **In-place reversal.**

```go
type ListNode struct {
    Val  int
    Next *ListNode
}

func reverseList(head *ListNode) *ListNode {
    var prev *ListNode
    for cur := head; cur != nil; {
        next := cur.Next
        cur.Next = prev
        prev, cur = cur, next
    }
    return prev
}
```

Draw the pointers before you write the code. Most bugs are a lost `next` reference.

### problems
- easy reverse-linked-list Reverse Linked List
- easy merge-two-sorted-lists Merge Two Sorted Lists
- easy linked-list-cycle Linked List Cycle
- medium reorder-list Reorder List
- medium remove-nth-node-from-end-of-list Remove Nth Node From End of List
- medium add-two-numbers Add Two Numbers
- medium copy-list-with-random-pointer Copy List with Random Pointer
- medium find-the-duplicate-number Find the Duplicate Number
- hard reverse-nodes-in-k-group Reverse Nodes in k-Group

### cards
Q: Why use a dummy head node?
A: The real head may change (it gets removed, or a merge starts with either list). A dummy gives one uniform "previous" node, and you return `dummy.Next`.
Q: How do fast and slow pointers find the middle of a list?
A: Slow moves 1 step and fast moves 2. When fast reaches the end, slow is at the middle.
Q: How does Floyd's algorithm detect a cycle?
A: Fast (2 steps) and slow (1 step) meet inside the cycle if one exists. Resetting one pointer to the head and moving both 1 step finds the cycle's start.

## Topic: Queues and deques
id: t08-queues
days: 2
tags: queue, monotonic-queue

### pattern
A slice works as a FIFO queue: `q = append(q, x)` to push, `x, q = q[0], q[1:]` to pop. BFS uses one.

A **monotonic deque** keeps candidates in decreasing order, which gives sliding-window maximums in O(n):

```go
func maxSlidingWindow(nums []int, k int) []int {
    var dq, res []int // dq holds indices; values decreasing
    for i, x := range nums {
        if len(dq) > 0 && dq[0] <= i-k {
            dq = dq[1:] // front fell out of the window
        }
        for len(dq) > 0 && nums[dq[len(dq)-1]] <= x {
            dq = dq[:len(dq)-1]
        }
        dq = append(dq, i)
        if i >= k-1 {
            res = append(res, nums[dq[0]])
        }
    }
    return res
}
```

### problems
- easy implement-queue-using-stacks Implement Queue using Stacks
- easy number-of-recent-calls Number of Recent Calls
- medium design-circular-queue Design Circular Queue
- medium dota2-senate Dota2 Senate
- hard sliding-window-maximum Sliding Window Maximum
- hard shortest-subarray-with-sum-at-least-k Shortest Subarray with Sum at Least K

### cards
Q: How does a monotonic deque give the max of each sliding window?
A: It holds indices whose values are decreasing. The front is the window max. You pop from the front when it leaves the window, and from the back when a bigger value arrives.
Q: How do you implement a queue with two stacks in amortized O(1)?
A: Push onto the "in" stack. To pop, if "out" is empty, move everything from "in" to "out" (which reverses the order), then pop from "out".
Q: What's the memory gotcha with `q = q[1:]` in Go?
A: The backing array isn't freed while the slice still references it. For long-running queues, copy occasionally or use a ring buffer.

## Boss: Timed set: stacks and lists
id: dboss-p2
problems: 4
minutes: 60
Four unseen problems: one stack, one monotonic stack, one linked list, and one of your choice. You pass with 3 of 4 within 60 minutes.
