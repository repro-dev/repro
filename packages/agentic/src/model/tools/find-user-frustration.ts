import {
  ConsoleEvent,
  InteractionEvent,
  InteractionType,
  LogLevel,
} from '@repro/domain'
import {
  extractConsoleText,
  extractPathname,
  groupBySlidingWindow,
  groupNetworkEvents,
  unwrapNetworkEvents,
} from '@repro/source-utils'
import { Box } from '@repro/tdl'
import { chain, resolve } from 'fluture'
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
  return recording
    .getEventsInRange(
      0,
      recording.getDuration() > 0
        ? recording.getDuration()
        : Number.MAX_SAFE_INTEGER
    )
    .pipe(
      chain(allEvents => {
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
          const at = interactionData.get('at').orElse([0, 0]) as [
            number,
            number,
          ]
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
            if (
              euclideanDistance(anchor.at, candidate.at) <= RAGE_CLICK_RADIUS
            ) {
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

        const navGroups = groupBySlidingWindow(
          pageTransitions,
          t => t.time,
          RAPID_NAV_WINDOW_MS,
          RAPID_NAV_THRESHOLD
        )
        for (const navGroup of navGroups) {
          const windowMs = navGroup.endTime - navGroup.startTime
          const urls = pageTransitions
            .slice(navGroup.startIndex, navGroup.endIndex + 1)
            .map(t => t.to)
            .join(', ')
          signals.push({
            timeMs: navGroup.startTime,
            type: 'rapid_navigation',
            summary: `${navGroup.count} page transitions within ${windowMs}ms`,
            details: urls,
          })
        }

        // ─── Error loop detection ─────────────────────────────────────────────────

        // Console error loops — group by message text
        const consoleErrors: Array<{ time: number; message: string }> = []
        for (const event of allEvents) {
          if (!isConsoleEvent(event)) continue
          const consoleEvent = event as Box<ConsoleEvent>
          const level = consoleEvent
            .get('data')
            .get('level')
            .orElse(LogLevel.Info)
          if (level !== LogLevel.Error) continue
          const time = consoleEvent.get('time').orElse(0)
          const { text: message } = extractConsoleText(
            consoleEvent,
            serializeMessagePart
          )
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
          const errorItems = indices.map(idx => consoleErrors[idx]!)
          const errorGroups = groupBySlidingWindow(
            errorItems,
            item => item.time,
            ERROR_LOOP_WINDOW_MS,
            ERROR_LOOP_THRESHOLD
          )
          for (const group of errorGroups) {
            const windowMs = group.endTime - group.startTime
            signals.push({
              timeMs: group.startTime,
              type: 'error_loop',
              summary: `Error repeated ${
                group.count
              } times in ${windowMs}ms: ${message.slice(0, 100)}`,
            })
          }
        }

        // Network error loops — group by method + pathname + status
        // Filter network events from allEvents to avoid a second full scan.
        const raw: import('@repro/domain').SourceEvent[] = []
        for (const e of allEvents) {
          if (isNetworkEvent(e))
            raw.push(e as import('@repro/domain').SourceEvent)
        }
        const groups = groupNetworkEvents(unwrapNetworkEvents(raw))

        const networkErrors: Array<{ time: number; key: string }> = []
        for (const group of groups) {
          if (group.type !== 'fetch') continue
          if (!group.response || group.response.status < 400) continue
          const time = group.requestTime
          const pathname = extractPathname(group.request.url)
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
          const errorItems = indices.map(idx => networkErrors[idx]!)
          const errorGroups = groupBySlidingWindow(
            errorItems,
            item => item.time,
            ERROR_LOOP_WINDOW_MS,
            ERROR_LOOP_THRESHOLD
          )
          for (const group of errorGroups) {
            const windowMs = group.endTime - group.startTime
            signals.push({
              timeMs: group.startTime,
              type: 'error_loop',
              summary: `Network failure repeated ${group.count} times in ${windowMs}ms: ${key}`,
            })
          }
        }

        // ─── Sort all signals by timeMs ────────────────────────────────────────────

        signals.sort((a, b) => a.timeMs - b.timeMs)

        const result = { signals }
        return resolve({ ...result, _tokenEstimate: estimateTokens(result) })
      })
    )
}
