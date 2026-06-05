/**
 * Regression detection logic for the eval baseline.
 *
 * Separated from index.ts so it can be unit-tested without pulling in the
 * full CLI entry point (which has fs / process.env dependencies).
 */

export interface BaselineEntry {
  fixtureName: string
  correctnessRate: number
  avgErrorRate: number
  avgToolCalls: number
  // Composite average of brevity, directness, signalNoise (1–3 scale; seeded at 2.0)
  avgQuality: number
}

/** A subset of EvalResult that regression detection needs. */
export interface EvalResultSnapshot {
  fixtureName: string
  correctnessRate: number
  averageToolErrorRate: number
  averageIterationDepth: number
  // Composite average of quality dimensions (brevity + directness + signalNoise) / 3
  compositeQualityScore: number
}

export type RegressionMetric =
  | 'correctnessRate'
  | 'avgErrorRate'
  | 'avgToolCalls'
  | 'avgQuality'

export interface RegressionEntry {
  fixtureName: string
  metric: RegressionMetric
  /** How far the current value exceeds the threshold (positive = worse). */
  delta: number
  baseline: number
  current: number
}

/**
 * Returns one entry per regressing fixture, describing which metric first
 * breached its threshold and by how much.
 *
 * Thresholds:
 *   - correctnessRate: any drop is a regression (no tolerance)
 *   - avgErrorRate: >baseline + 0.10 absolute
 *   - avgToolCalls: >baseline + 3 absolute
 *   - avgQuality: composite average dropped by >0.5 points
 *
 * New fixtures (no baseline entry) are never treated as regressions.
 */
export function findRegressions(
  results: Array<EvalResultSnapshot>,
  baseline: Array<BaselineEntry>
): Array<RegressionEntry> {
  const baselineMap = new Map(baseline.map(b => [b.fixtureName, b]))
  const regressions: Array<RegressionEntry> = []

  for (const r of results) {
    const b = baselineMap.get(r.fixtureName)
    if (b === undefined) continue // new fixture — not a regression

    // Check correctnessRate first (no tolerance — any drop is meaningful)
    if (r.correctnessRate < b.correctnessRate) {
      regressions.push({
        fixtureName: r.fixtureName,
        metric: 'correctnessRate',
        delta: b.correctnessRate - r.correctnessRate,
        baseline: b.correctnessRate,
        current: r.correctnessRate,
      })
      continue
    }

    // Check avgErrorRate with ±10pp absolute tolerance
    const errorRateDelta = r.averageToolErrorRate - (b.avgErrorRate + 0.1)
    if (errorRateDelta > 0) {
      regressions.push({
        fixtureName: r.fixtureName,
        metric: 'avgErrorRate',
        delta: errorRateDelta,
        baseline: b.avgErrorRate,
        current: r.averageToolErrorRate,
      })
      continue
    }

    // Check avgToolCalls with ±3 absolute tolerance
    const toolCallsDelta = r.averageIterationDepth - (b.avgToolCalls + 3)
    if (toolCallsDelta > 0) {
      regressions.push({
        fixtureName: r.fixtureName,
        metric: 'avgToolCalls',
        delta: toolCallsDelta,
        baseline: b.avgToolCalls,
        current: r.averageIterationDepth,
      })
      continue
    }

    // Check avgQuality: composite drop of >0.5 points from baseline
    const qualityDelta = b.avgQuality - r.compositeQualityScore
    if (qualityDelta > 0.5) {
      regressions.push({
        fixtureName: r.fixtureName,
        metric: 'avgQuality',
        delta: qualityDelta,
        baseline: b.avgQuality,
        current: r.compositeQualityScore,
      })
    }
  }

  return regressions
}
