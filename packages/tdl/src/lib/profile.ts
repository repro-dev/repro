import { logger } from '@repro/logger'

export interface ProfileReport {
  profilingCycle: number
  maxDepth: number
  getByteLengthCalls: number
  getByteLengthCallsByType: Record<string, number>
  codePointsScanned: number
  nodeWrites: number
  sizePassMs: number
  writePassMs: number
  totalMs: number
}

// Browser/import-safe: `typeof process` short-circuits in bundles with no process shim;
// in the capture build, vite's define statically replaces `process.env.TDL_PROFILE`.
let enabled =
  typeof process !== 'undefined' && !!process.env && !!process.env.TDL_PROFILE

let profilingCycle = 0 // 0=none, 1=size-pass, 2=write-pass
let encodeDepth = 0
let maxDepth = 0
let getByteLengthCalls = 0
let getByteLengthCallsByType: Record<string, number> = {}
let codePointsScanned = 0
let nodeWrites = 0
let sizePassStartMs = 0
let sizePassEndMs = 0
let writePassStartMs = 0
let writePassEndMs = 0

// Stores the most recent report so tests can read it after reset clears counters
let lastReportData: ProfileReport | null = null

export function enable(): void {
  enabled = true
  profilingCycle = 0
  encodeDepth = 0
}

export function disable(): void {
  enabled = false
  profilingCycle = 0
  encodeDepth = 0
}

export function reset(): void {
  profilingCycle = 0
  encodeDepth = 0
  maxDepth = 0
  getByteLengthCalls = 0
  getByteLengthCallsByType = {}
  codePointsScanned = 0
  nodeWrites = 0
  sizePassStartMs = 0
  sizePassEndMs = 0
  writePassStartMs = 0
  writePassEndMs = 0
}

export function report(): ProfileReport {
  const reportData: ProfileReport = {
    profilingCycle,
    maxDepth,
    getByteLengthCalls,
    getByteLengthCallsByType: { ...getByteLengthCallsByType },
    codePointsScanned,
    nodeWrites,
    sizePassMs: sizePassEndMs ? sizePassEndMs - sizePassStartMs : 0,
    writePassMs: writePassEndMs ? writePassEndMs - writePassStartMs : 0,
    totalMs: writePassEndMs ? writePassEndMs - sizePassStartMs : 0,
  }
  lastReportData = reportData
  if (enabled) {
    logger.info(reportData)
  }
  return reportData
}

/** Read the last report emitted during encoding — useful in tests after reset clears counters. */
export function getLastReport(): ProfileReport | null {
  return lastReportData
}

export const prof = {
  get enabled() {
    return enabled
  },
  get profilingCycle() {
    return profilingCycle
  },
  set profilingCycle(v: number) {
    profilingCycle = v
  },
  get encodeDepth() {
    return encodeDepth
  },
  set encodeDepth(v: number) {
    encodeDepth = v
  },
  get maxDepth() {
    return maxDepth
  },
  set maxDepth(v: number) {
    maxDepth = v
  },
  get sizePassStartMs() {
    return sizePassStartMs
  },
  set sizePassStartMs(v: number) {
    sizePassStartMs = v
  },
  get sizePassEndMs() {
    return sizePassEndMs
  },
  set sizePassEndMs(v: number) {
    sizePassEndMs = v
  },
  get writePassStartMs() {
    return writePassStartMs
  },
  set writePassStartMs(v: number) {
    writePassStartMs = v
  },
  get writePassEndMs() {
    return writePassEndMs
  },
  set writePassEndMs(v: number) {
    writePassEndMs = v
  },
  incGetByteLengthCalls() {
    getByteLengthCalls++
  },
  incGetByteLengthCallsByType(type: string) {
    getByteLengthCallsByType[type] = (getByteLengthCallsByType[type] ?? 0) + 1
  },
  addCodePoints(n: number) {
    codePointsScanned += n
  },
  incNodeWrites() {
    nodeWrites++
  },
}
