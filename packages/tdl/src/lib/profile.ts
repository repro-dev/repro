import { logger } from '@repro/logger'

declare const __TDL_PROFILE__: boolean | undefined

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

// Default-enabled at build time via the `__TDL_PROFILE__` define (capture vite config
// sets it from the TDL_PROFILE env var). The `typeof` guard keeps module-eval safe in any
// bundle/runtime that doesn't define it (node tests, other bundlers) — there it stays off,
// and enable()/disable() control state explicitly.
let enabled: boolean =
  typeof __TDL_PROFILE__ !== 'undefined' ? __TDL_PROFILE__ : false

let profilingCycle = 0 // 0=none, 1=size-pass, 2=write-pass
let encodeDepth = 0
let maxDepth = 0
let getByteLengthCalls = 0
let getByteLengthCallsByType: Record<string, number> = {}
let codePointsScanned = 0
let nodeWrites = 0
let sizePassStartMs = -1
let sizePassEndMs = -1
let writePassStartMs = -1
let writePassEndMs = -1

// Stores the most recent report so tests can read it after reset clears counters
let lastReportData: ProfileReport | null = null

// Default 1000 filters per-event encodes (pointer moves, small DOM patches);
// lower it (e.g. setReportThreshold(0)) for fine-grained debugging.
let reportThreshold = 1000

export function setReportThreshold(n: number): void {
  reportThreshold = n
}

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
  sizePassStartMs = -1
  sizePassEndMs = -1
  writePassStartMs = -1
  writePassEndMs = -1
}

export function report(): ProfileReport {
  const reportData: ProfileReport = {
    profilingCycle,
    maxDepth,
    getByteLengthCalls,
    getByteLengthCallsByType: { ...getByteLengthCallsByType },
    codePointsScanned,
    nodeWrites,
    sizePassMs: sizePassEndMs >= 0 ? sizePassEndMs - sizePassStartMs : 0,
    writePassMs: writePassEndMs >= 0 ? writePassEndMs - writePassStartMs : 0,
    totalMs: writePassEndMs >= 0 ? writePassEndMs - sizePassStartMs : 0,
  }
  lastReportData = reportData
  // Guarded at call site; conditional here is defense-in-depth
  if (enabled && nodeWrites >= reportThreshold) {
    logger.info('[tdl-profile]', reportData)
  }
  return reportData
}

/** Read the last report emitted during encoding — useful in tests after reset clears counters. */
export function getLastReport(): ProfileReport | null {
  return lastReportData
}

// Profiler assumes the outermost encode enters through encodeProperty
// (not encodeStruct / encodeVector etc.).
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
