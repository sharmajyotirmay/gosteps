# Phase 4: Trees

> Recursion with structure: depth-first and breadth-first traversal, BST invariants, and building trees.

## Topic: Depth-first traversal
id: t13-tree-dfs
days: 3
tags: binary-tree, depth-first-search

### pattern
Most tree problems are "compute something for each subtree and combine the results". Trust the recursion: solve the problem for `root` assuming the children already return correct answers.

```go
type TreeNode struct {
    Val         int
    Left, Right *TreeNode
}

func maxDepth(root *TreeNode) int {
    if root == nil {
        return 0
    }
    return 1 + max(maxDepth(root.Left), maxDepth(root.Right))
}
```

If the answer isn't what the function returns (diameter, for example), return the height and update a captured variable for the answer.

### problems
- easy invert-binary-tree Invert Binary Tree
- easy maximum-depth-of-binary-tree Maximum Depth of Binary Tree
- easy diameter-of-binary-tree Diameter of Binary Tree
- easy balanced-binary-tree Balanced Binary Tree
- easy same-tree Same Tree
- easy subtree-of-another-tree Subtree of Another Tree
- easy path-sum Path Sum
- easy binary-tree-inorder-traversal Binary Tree Inorder Traversal
- medium count-good-nodes-in-binary-tree Count Good Nodes in Binary Tree

### cards
Q: What's the "return one thing, track another" trick in tree DFS?
A: The function returns what the parent needs (such as height), while a captured variable records the global answer (such as the best diameter seen so far).
Q: Preorder vs inorder vs postorder: when is the node processed?
A: Preorder: before its children. Inorder: between left and right. Postorder: after both children. Use postorder when the answer needs the children's results.
Q: What's the base case in almost every tree recursion?
A: `root == nil`. Return the neutral value (0, true, or nil).

## Topic: Breadth-first and level order
id: t14-tree-bfs
days: 2
tags: breadth-first-search, binary-tree

### pattern
Process one level at a time by taking the queue's length at the start of each level:

```go
func levelOrder(root *TreeNode) [][]int {
    var res [][]int
    if root == nil {
        return res
    }
    q := []*TreeNode{root}
    for len(q) > 0 {
        level := make([]int, 0, len(q))
        for range len(q) { // Go 1.22: range over int
            n := q[0]
            q = q[1:]
            level = append(level, n.Val)
            if n.Left != nil { q = append(q, n.Left) }
            if n.Right != nil { q = append(q, n.Right) }
        }
        res = append(res, level)
    }
    return res
}
```

BFS gives the **minimum depth** quickly, because it stops at the first leaf.

### problems
- easy average-of-levels-in-binary-tree Average of Levels in Binary Tree
- easy minimum-depth-of-binary-tree Minimum Depth of Binary Tree
- medium binary-tree-level-order-traversal Binary Tree Level Order Traversal
- medium binary-tree-right-side-view Binary Tree Right Side View
- medium binary-tree-zigzag-level-order-traversal Binary Tree Zigzag Level Order Traversal
- medium maximum-width-of-binary-tree Maximum Width of Binary Tree

### cards
Q: How do you separate levels in a BFS?
A: Record `len(q)` at the start of each level and pop exactly that many nodes before moving on.
Q: Why is BFS better than DFS for minimum depth?
A: BFS reaches the shallowest leaf first and can stop there. DFS might explore a deep branch completely before finding it.
Q: How do you compute width when nodes are missing?
A: Give each node a position index (`2i` and `2i+1` for its children) and take `last - first + 1` per level.

## Topic: Binary search trees
id: t15-bst
days: 3
tags: binary-search-tree

### pattern
In a BST, everything in the left subtree is less than the node and everything in the right subtree is greater, **recursively**. Validate with bounds rather than by comparing only with direct children:

```go
func isValidBST(root *TreeNode) bool {
    var ok func(n *TreeNode, lo, hi *int) bool
    ok = func(n *TreeNode, lo, hi *int) bool {
        if n == nil {
            return true
        }
        if (lo != nil && n.Val <= *lo) || (hi != nil && n.Val >= *hi) {
            return false
        }
        return ok(n.Left, lo, &n.Val) && ok(n.Right, &n.Val, hi)
    }
    return ok(root, nil, nil)
}
```

An inorder traversal of a BST visits values in sorted order. Many BST problems become "inorder plus a counter".

### problems
- easy convert-sorted-array-to-binary-search-tree Convert Sorted Array to Binary Search Tree
- easy search-in-a-binary-search-tree Search in a Binary Search Tree
- medium validate-binary-search-tree Validate Binary Search Tree
- medium kth-smallest-element-in-a-bst Kth Smallest Element in a BST
- medium lowest-common-ancestor-of-a-binary-search-tree Lowest Common Ancestor of a Binary Search Tree
- medium insert-into-a-binary-search-tree Insert into a Binary Search Tree
- medium delete-node-in-a-bst Delete Node in a BST

### cards
Q: Why isn't checking `left.Val < node.Val < right.Val` enough to validate a BST?
A: The rule applies to entire subtrees. A deep left descendant could still be larger than an ancestor. Pass lower and upper bounds down instead.
Q: What order does an inorder traversal of a BST produce?
A: Ascending sorted order.
Q: How do you find the LCA in a BST without searching both sides?
A: Walk down from the root. If both values are smaller, go left. If both are larger, go right. Otherwise the current node is the LCA.

## Topic: Construction and path problems
id: t16-tree-build
days: 2
tags: binary-tree, tree

### pattern
**Construction.** Preorder gives you the root, and the root's position in the inorder sequence splits the left and right subtrees. Use a map from value to inorder index so the lookup is O(1).

**Path sums.** A path can bend at any node, so return the best *single-branch* gain upward and update a global best with `left + node + right`:

```go
func maxPathSum(root *TreeNode) int {
    best := math.MinInt
    var gain func(*TreeNode) int
    gain = func(n *TreeNode) int {
        if n == nil {
            return 0
        }
        l, r := max(gain(n.Left), 0), max(gain(n.Right), 0)
        best = max(best, n.Val+l+r)
        return n.Val + max(l, r)
    }
    gain(root)
    return best
}
```

### problems
- medium construct-binary-tree-from-preorder-and-inorder-traversal Construct Binary Tree from Preorder and Inorder Traversal
- medium lowest-common-ancestor-of-a-binary-tree Lowest Common Ancestor of a Binary Tree
- medium path-sum-ii Path Sum II
- medium flatten-binary-tree-to-linked-list Flatten Binary Tree to Linked List
- hard binary-tree-maximum-path-sum Binary Tree Maximum Path Sum
- hard serialize-and-deserialize-binary-tree Serialize and Deserialize Binary Tree

### cards
Q: How do preorder and inorder sequences determine a tree?
A: Preorder's first element is the root. Its index in inorder splits the inorder sequence into the left and right subtrees, and you recurse on each.
Q: In Max Path Sum, why does the function return `n.Val + max(l, r)` but update `best` with `n.Val + l + r`?
A: A parent can extend only one branch of the path, but the best path may bend at this node and use both branches.
Q: Why clamp child gains with `max(gain, 0)`?
A: A negative branch only lowers the sum, so it's better to leave it out.

## Boss: Timed set: trees
id: dboss-p4
problems: 4
minutes: 60
Four unseen tree problems, with at least one BFS and one BST. You pass with 3 of 4 within 60 minutes.
