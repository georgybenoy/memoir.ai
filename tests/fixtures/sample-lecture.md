# Computer Science Algorithms and Data Structures

## Tree Data Structures

Trees are hierarchical nonlinear data structures consisting of nodes connected by directed or undirected edges.

### Binary Search Trees

A Binary Search Tree (BST) is a rooted binary tree data structure with the key property: the key in each node must be greater than or equal to any key in its left sub-tree, and less than or equal to any key in its right sub-tree.

Inorder traversal of a BST yields elements in monotonically non-decreasing order. Average search complexity is O(log n), but pathological unbalanced trees degrade to linear O(n) performance.

### Balanced Self-Balancing Trees

To guarantee O(log n) worst-case time complexity, balanced trees like AVL trees and Red-Black trees automatically rebalance upon insertion and deletion operations using tree rotations.

AVL trees maintain the balance factor invariant: for every node, the height difference between left and right subtrees must be at most 1.

## Graph Algorithms

Graphs are mathematical structures used to model pairwise relations between objects. A graph is composed of vertices (nodes) and edges.

### Dijkstra's Shortest Path Algorithm

Dijkstra's algorithm solves the single-source shortest path problem for a graph with non-negative edge weights. It iteratively selects the unvisited vertex with the smallest tentative distance using a priority queue (min-heap).

Time complexity using a Fibonacci heap is O(|E| + |V| log |V|).

### Topological Sorting

Topological sort of a directed acyclic graph (DAG) is a linear ordering of vertices such that for every directed edge u -> v, u comes before v. Kahn's algorithm computes this using in-degree vertex tracking.
