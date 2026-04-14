import {
  ConsoleEvent,
  InteractionEvent,
  InteractionType,
  LogLevel,
  NetworkEvent,
} from '@repro/domain'
import { groupNetworkEvents } from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { resolve } from 'fluture'
import { estimateTokens } from '../token-optimization'
import type { ToolHandler } from './common'
import {
  isConsoleEvent,
  isDOMPatchEvent,
  isInteractionEvent,
  isNetworkEvent,
  serializeMessagePart,
} from './common'

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'findUserFrustration',
    description:
      'Detect user frustration signals in the recording: rage clicks, dead clicks, rapid navigation, and error loops. Returns all detected signals in chronological order.',
    parameters: {
      type: 'object',
      properties: {},
      required: [] as string[],
    },
  },
}

// ─── Detection constants ───────────────────────────────────────────────────────

const RAGE_CLICK_THRESHOLD = 3
const RAGE_CLICK_WINDOW_MS = 1000
const RAGE_CLICK_RADIUS = 50

const DEAD_CLICK_WINDOW_MS = 500

const RAPID_NAV_THRESHOLD = 3
const RAPID_NAV_WINDOW_MS = 5000

const ERROR_LOOP_THRESHOLD = 3
const ERROR_LOOP_WINDOW_MS = 10000

// ─── Internal types ────────────────────────────────────────────────────────────

interface FrustrationSignal {
  timeMs: number
  type: 'rage_click' | 'dead_click' | 'rapid_navigation' | 'error_loop'
  summary: string
  details?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function euclideanDistance(a: [number, number], b: [number, number]): number {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2))
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler: ToolHandler = (recording, _args) => {
  const signals: FrustrationSignal[] = []

  // Collect all events once — used for dead-click range checks
  const allEvents = recording.getEventsInRange(
    0,
    recording.getDuration() > 0
      ? recording.getDuration()
      : Number.MAX_SAFE_INTEGER
  )

  // ─── Rage click detection ──────────────────────────────────────────────────

  const clickEvents: Array<{ time: number; at: [number, number] }> = []

  for (const event of allEvents) {
    if (!isInteractionEvent(event)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interactionData = (event as Box<InteractionEvent>)
      .get('data')
      .orElse(null) as Box<any> | null
    if (!interactionData) continue
    const interactionType = interactionData
      .get('type')
      .orElse(-1 as InteractionType)
    if (interactionType !== InteractionType.Click) continue
    const time = event.get('time').orElse(0)
    const at = interactionData.get('at').orElse([0, 0]) as [number, number]
    clickEvents.push({ time, at })
  }

  // Track which click indices are part of a rage-click group (skip for dead click)
  const rageClickIndices = new Set<number>()

  let i = 0
  while (i < clickEvents.length) {
    const anchor = clickEvents[i]!
    const group: number[] = [i]

    for (let j = i + 1; j < clickEvents.length; j++) {
      const candidate = clickEvents[j]!
      if (candidate.time - anchor.time > RAGE_CLICK_WINDOW_MS) break
      if (euclideanDistance(anchor.at, candidate.at) <= RAGE_CLICK_RADIUS) {
        group.push(j)
      }
    }

    if (group.length >= RAGE_CLICK_THRESHOLD) {
      // Record all indices as rage-click covered
      for (const idx of group) rageClickIndices.add(idx)

      const lastInGroup = clickEvents[group[group.length - 1]!]!
      const windowMs = lastInGroup.time - anchor.time
      const x = Math.round(anchor.at[0])
      const y = Math.round(anchor.at[1])
      signals.push({
        timeMs: anchor.time,
        type: 'rage_click',
        summary: `${group.length} clicks within ${windowMs}ms at (${x}, ${y})`,
      })
      // Advance past the group
      i = group[group.length - 1]! + 1
    } else {
      i++
    }
  }

  // ─── Dead click detection ──────────────────────────────────────────────────
  // Build a sorted list of events that count as a click producing visible
  // progress, then walk it once alongside clickEvents. This avoids re-scanning
  // overlapping windows for every click candidate.

  const dominantEventTimes: number[] = []
  for (const event of allEvents) {
    if (isDOMPatchEvent(event)) {
      dominantEventTimes.push(event.get('time').orElse(0) as number)
      continue
    }

    if (!isInteractionEvent(event)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (event as Box<InteractionEvent>)
      .get('data')
      .orElse(null) as Box<any> | null
    if (!data) continue
    const type = data.get('type').orElse(-1 as InteractionType)
    if (type === InteractionType.PageTransition) {
      dominantEventTimes.push(event.get('time').orElse(0) as number)
    }
  }

  let dominantEventIndex = 0
  for (let ci = 0; ci < clickEvents.length; ci++) {
    if (rageClickIndices.has(ci)) continue
    const { time, at } = clickEvents[ci]!
    const windowEnd = time + DEAD_CLICK_WINDOW_MS

    while (
      dominantEventIndex < dominantEventTimes.length &&
      dominantEventTimes[dominantEventIndex]! < time
    ) {
      dominantEventIndex++
    }

    const dominated =
      dominantEventIndex < dominantEventTimes.length &&
      dominantEventTimes[dominantEventIndex]! <= windowEnd

    if (!dominated) {
      const x = Math.round(at[0])
      const y = Math.round(at[1])
      signals.push({
        timeMs: time,
        type: 'dead_click',
        summary: `Click at (${x}, ${y}) produced no DOM change or navigation`,
      })
    }
  }

  // ─── Rapid navigation detection ───────────────────────────────────────────

  const pageTransitions: Array<{
    time: number
    to: string
    from: string | null
  }> = []

  for (const event of allEvents) {
    if (!isInteractionEvent(event)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interactionData = (event as Box<InteractionEvent>)
      .get('data')
      .orElse(null) as Box<any> | null
    if (!interactionData) continue
    const interactionType = interactionData
      .get('type')
      .orElse(-1 as InteractionType)
    if (interactionType !== InteractionType.PageTransition) continue
    const time = event.get('time').orElse(0)
    const to = interactionData.get('to').orElse('') as string
    const from = interactionData.get('from').orElse(null) as string | null
    pageTransitions.push({ time, to, from })
  }

  let pi = 0
  while (pi < pageTransitions.length) {
    const anchor = pageTransitions[pi]!
    const group: number[] = [pi]

    for (let pj = pi + 1; pj < pageTransitions.length; pj++) {
      const candidate = pageTransitions[pj]!
      if (candidate.time - anchor.time > RAPID_NAV_WINDOW_MS) break
      group.push(pj)
    }

    if (group.length >= RAPID_NAV_THRESHOLD) {
      const lastInGroup = pageTransitions[group[group.length - 1]!]!
      const windowMs = lastInGroup.time - anchor.time
      const urls = group.map(idx => pageTransitions[idx]!.to).join(', ')
      signals.push({
        timeMs: anchor.time,
        type: 'rapid_navigation',
        summary: `${group.length} page transitions within ${windowMs}ms`,
        details: urls,
      })
      pi = group[group.length - 1]! + 1
    } else {
      pi++
    }
  }

  // ─── Error loop detection ─────────────────────────────────────────────────

  // Console error loops — group by message text
  const consoleErrors: Array<{ time: number; message: string }> = []
  for (const event of allEvents) {
    if (!isConsoleEvent(event)) continue
    const consoleEvent = event as Box<ConsoleEvent>
    const level = consoleEvent.get('data').get('level').orElse(LogLevel.Info)
    if (level !== LogLevel.Error) continue
    const time = consoleEvent.get('time').orElse(0)
    const parts = consoleEvent.get('data').get('parts').orElse([])
    const message = parts.map(serializeMessagePart).join(' ')
    consoleErrors.push({ time, message })
  }

  // Group console errors by message
  const consoleByMessage = new Map<string, number[]>()
  for (let ei = 0; ei < consoleErrors.length; ei++) {
    const { message } = consoleErrors[ei]!
    const existing = consoleByMessage.get(message) ?? []
    existing.push(ei)
    consoleByMessage.set(message, existing)
  }

  for (const [message, indices] of consoleByMessage) {
    let li = 0
    while (li < indices.length) {
      const anchorTime = consoleErrors[indices[li]!]!.time
      const group: number[] = [li]
      for (let lj = li + 1; lj < indices.length; lj++) {
        const candidateTime = consoleErrors[indices[lj]!]!.time
        if (candidateTime - anchorTime > ERROR_LOOP_WINDOW_MS) break
        group.push(lj)
      }
      if (group.length >= ERROR_LOOP_THRESHOLD) {
        const lastTime = consoleErrors[indices[group[group.length - 1]!]!]!.time
        const windowMs = lastTime - anchorTime
        signals.push({
          timeMs: anchorTime,
          type: 'error_loop',
          summary: `Error repeated ${
            group.length
          } times in ${windowMs}ms: ${message.slice(0, 100)}`,
        })
        li = group[group.length - 1]! + 1
      } else {
        li++
      }
    }
  }

  // Network error loops — group by method + pathname + status
  // Filter network events from allEvents to avoid a second full scan.
  const indexed: Array<[NetworkEvent, number]> = []
  for (const e of allEvents) {
    if (!isNetworkEvent(e)) continue
    ;(e as Box<NetworkEvent>).apply(n => indexed.push([n, 0]))
  }
  const groups = groupNetworkEvents(indexed)

  const networkErrors: Array<{ time: number; key: string }> = []
  for (const group of groups) {
    if (group.type !== 'fetch') continue
    if (!group.response || group.response.status < 400) continue
    const time = group.requestTime
    let pathname: string
    try {
      pathname = new URL(group.request.url).pathname
    } catch {
      pathname = group.request.url
    }
    const key = `${group.request.method} ${pathname} → ${group.response.status}`
    networkErrors.push({ time, key })
  }

  networkErrors.sort((a, b) => a.time - b.time)

  const networkByKey = new Map<string, number[]>()
  for (let ni = 0; ni < networkErrors.length; ni++) {
    const { key } = networkErrors[ni]!
    const existing = networkByKey.get(key) ?? []
    existing.push(ni)
    networkByKey.set(key, existing)
  }

  for (const [key, indices] of networkByKey) {
    let ni = 0
    while (ni < indices.length) {
      const anchorTime = networkErrors[indices[ni]!]!.time
      const group: number[] = [ni]
      for (let nj = ni + 1; nj < indices.length; nj++) {
        const candidateTime = networkErrors[indices[nj]!]!.time
        if (candidateTime - anchorTime > ERROR_LOOP_WINDOW_MS) break
        group.push(nj)
      }
      if (group.length >= ERROR_LOOP_THRESHOLD) {
        const lastTime = networkErrors[indices[group[group.length - 1]!]!]!.time
        const windowMs = lastTime - anchorTime
        signals.push({
          timeMs: anchorTime,
          type: 'error_loop',
          summary: `Network failure repeated ${group.length} times in ${windowMs}ms: ${key}`,
        })
        ni = group[group.length - 1]! + 1
      } else {
        ni++
      }
    }
  }

  // ─── Sort all signals by timeMs ────────────────────────────────────────────

  signals.sort((a, b) => a.timeMs - b.timeMs)

  const result = { signals }
  return resolve({ ...result, _tokenEstimate: estimateTokens(result) })
}
