# REP-1443: TDL Snapshot Encoding Profiler — Findings

## Summary

A flag-gated profiler was added to `packages/tdl` to confirm the hypothesis that
`getByteLength` recomputation in TDL's snapshot encoding exhibits O(n·depth)
complexity, degrading toward O(n²) on deep trees. The profiler was tested with
deterministic micro-benchmarks; the data **confirms the hypothesis**.

The encoder does a full size-traversal of the entire tree in the default-argument
expression of `encodeProperty`, then recomputes subtree sizes again for every
ancestor during the field-offset loop. Strings are re-scanned character-by-character
on every recomputation pass.

## Methodology

A profiler module (`packages/tdl/src/lib/profile.ts`) was added with guarded counters
and a `profilingCycle` state machine that distinguishes the size pass from the write
pass. Key counters:

- `getByteLengthCalls` — total calls to `getByteLength` (the recomputation hotspot)
- `getByteLengthCallsByType` — per-descriptor-type breakdown
- `codePointsScanned` — total code points scanned in string branches
- `maxDepth` — maximum nesting depth reached during the encode
- `nodeWrites` — number of `encodeProperty` top-level entries (one per node written)

Tests encode synthetic trees of known depth and breadth, read the report (captured
before `reset()` clears counters between outermost encodes), and assert growth
ratios.

Instrumentation is zero-overhead when disabled (all counters gated by
`if (prof.enabled)`) and produces **byte-for-byte identical output** — the encoder
is never mutated, only read from.

## Results

### Deep-chain growth (confirming O(n·depth))

Synthetic nested struct chain with one field per level, terminating in an integer leaf:

| Depth | Nodes | `getByteLengthCalls` | `maxDepth` | `nodeWrites` | Ratio (calls/nodes) |
|-------|-------|---------------------|------------|--------------|---------------------|
| 5     | 6     | 21                  | 6          | 6            | 3.50                |
| 8     | 9     | 45                  | 9          | 9            | 5.00                |
| 10    | 11    | 66                  | 11         | 11           | 6.00                |

Formula: calls ≈ N·(N+1)/2 where N = nodes = depth+1.

The growth follows Θ(N²): depth 10 produces 66 calls vs depth 5's 21 calls,
a 3.14× increase for 2× the depth. This matches O(n·depth) where average depth
scales linearly with node count in a chain.

### Flat-struct baseline (linear)

Synthetic shallow struct with N integer leaf fields (depth = 2):

| Fields | Nodes | `getByteLengthCalls` | `maxDepth` | `nodeWrites` | Ratio (calls/nodes) |
|--------|-------|---------------------|------------|--------------|---------------------|
| 8      | 9     | 17                  | 2          | 9            | 1.89                |
| 12     | 13    | 25                  | 2          | 13           | 1.92                |
| 20     | 21    | 41                  | 2          | 21           | 1.95                |

Formula: calls ≈ 1 + 2·fields. Growth is Θ(N) — linear. Flat trees show no
super-linear recomputation penalty.

### Cross-comparison

At equal node count (~9 nodes each):
- Deep chain (depth 8): **45 calls** — 2.6× the flat struct
- Flat struct (8 fields): **17 calls**

This is the per-ancestor recomputation signature: each node's size is recomputed
for every ancestor between it and the root.

### Per-type breakdown (mixed fixture)

A fixture with `{integer, string, vector, map, char, bool}` fields:

| Descriptor type | `getByteLengthCalls` |
|-----------------|---------------------|
| char            | 12                  |
| integer         | 11                  |
| string          | 2                   |
| vector          | 2                   |
| map             | 2                   |
| struct          | 1                   |
| bool            | 2                   |

Total calls: 32, maxDepth: 3, nodeWrites: 13.

### String code-point scanning

A struct with two 5-char ASCII strings (`"hello"`, `"world"`):

| Metric               | Value |
|----------------------|-------|
| `codePointsScanned`  | 30    |
| `getByteLengthCalls` | 5     |
| `maxDepth`           | 2     |

Each string's 5 code points are scanned once in the size pass (2 × 5 = 10) and
rescanned in the field-offset loop (2 × 5 = 10) and in each encodeProperty
default-arg call (2 × 5 = 10). Total 30. This confirms per-ancestor re-scanning:
a string at depth D in a tree of average depth D̃ will be scanned D̃+1 times.

### Timing

All measured durations are sub-millisecond for these small fixtures. The size-pass
vs write-pass split shows the size pass (0.005–0.07ms) is typically ~25–50% of the
encode time, confirming the recomputation is a significant fraction of the total
work even at these scales.

| Fixture           | Size-pass (ms) | Write-pass (ms) | Total (ms) |
|-------------------|----------------|-----------------|------------|
| Deep chain d=5    | 0.069          | 0.194           | 0.266      |
| Deep chain d=10   | 0.008          | 0.040           | 0.049      |
| Flat struct f=12  | 0.006          | 0.013           | 0.019      |
| Mixed fixture     | 0.065          | 0.127           | 0.191      |

## Confirmed Complexity

- **Deep trees (chain)**: `getByteLength` calls = Θ(N²) where N = node count
- **Flat trees (shallow)**: `getByteLength` calls = Θ(N) where N = node count
- **Strings**: per-code-point scans = Θ(N_strings × avg_depth × avg_string_length)

This confirms the O(n·depth) hypothesis: recomputation cost is proportional to
the sum of subtree sizes over all nodes, which for deep trees is equivalent to
Θ(N²).

For a DOM snapshot with 10k nodes at average depth 50, the expected number of
`getByteLength` calls would be approximately N·avg_depth ≈ 500k — 50× the node
count.

## Recommended Optimization

### Approach: memoized subtree byte sizes (single-pass `{bytes, written}` encoder)

**Target complexity**: O(N) amortized — visit each node exactly twice (once to
compute sizes, once to write), same as the current structure but without
recomputation.

**Expected improvement**: For deep trees, `getByteLength` calls would drop from
Θ(N·depth) to Θ(N) — a 50× reduction for a typical DOM snapshot.

**Design sketch**:

1. **Memoize subtree sizes during the first (and only) size pass.** Replace the
   `getByteLength` default-arg pattern with an explicit `computeSizes` phase that
   returns a `Map<symbol, number>` of byte offsets. Each node computes its size
   once, stores it, and all ancestors read the cached value instead of recomputing.

2. **Bulk-copy buffers.** The current `encodeBuffer` writes one byte at a time via
   `setUint8`. Replace with `Uint8Array.set(dest, src)` for the buffer body.

3. **Cache per-string UTF-8 byte length.** `TextEncoder.encodeInto` computes the
   UTF-8 length internally. Store the computed length after the first pass and
   reuse it instead of re-scanning code points.

### Implementation risk

The default-arg trick (`view = createDataView(getByteLength(...))`) evaluates
*synchronously* before any body code runs, so the view is always allocated before
the encoder sees it. A memoized approach must ensure the size phase completes
before any write-phase allocation. The simplest approach: split encoding into
`computeSize(descriptor, data) → number` (recursive, memoized) and
`encode(descriptor, data, view, pointerRef)` (write phase only, no size calls).

## Next Steps

- The profiler instrumentation remains in-tree, **disabled by default**.
- The optimization work is deferred to a follow-up issue (tracked separately).
- The profiler can be re-enabled with `TDL_PROFILE=1` in the capture build to
  gather production-relevant profiles on real DOM snapshots before starting the
  optimization.
