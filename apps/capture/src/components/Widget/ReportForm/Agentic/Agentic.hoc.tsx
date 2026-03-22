import {
  EXTENSION_SYSTEM_CARD_MESSAGE,
  createAgenticState,
  type Context,
  type StreamProvider,
  type ToolDefinition,
} from '@repro/agentic'
import { AgenticStateContext, AgenticView } from '@repro/agentic-ui'
import { useApiClient } from '@repro/api-client'
import { SourceEvent, SourceEventType } from '@repro/domain'
import { usePlayback } from '@repro/playback'
import { parse } from 'event-stream-parser'
import { attemptP, chain } from 'fluture'
import React, { useMemo } from 'react'

export const Agentic: React.FC = () => {
  const apiClient = useApiClient()
  const playback = usePlayback()

  const streamProvider: StreamProvider = useMemo(
    () =>
      (context: Context, toolDefs: ToolDefinition[], signal?: AbortSignal) => {
        const response = apiClient.fetch<ReadableStream>(
          '/agentic/response',
          {
            method: 'POST',
            body: JSON.stringify({
              messages: [
                { role: 'system', content: EXTENSION_SYSTEM_CARD_MESSAGE },
                ...context,
              ],
              tools: toolDefs,
              tool_choice: 'auto',
            }),
            ...(signal != null ? { signal } : {}),
          },
          'json',
          'stream'
        )

        return response.pipe(chain(stream => attemptP(() => parse(stream))))
      },
    [apiClient]
  )

  const state = useMemo(
    () =>
      createAgenticState(streamProvider, {
        getDuration: () => playback.getDuration(),
        getSnapshotAtTime: (timestampMs: number) => {
          const pb = playback.copy()
          pb.seekToTime(timestampMs)
          return pb.getSnapshot()
        },
        // Invert from Record<resourceId, absoluteURL> to
        // Record<absoluteURL, resourceId>. In the capture widget the resource
        // map is always empty (resources aren't fetched client-side), so this
        // produces {} in practice — see REP-XXX for the follow-up.
        getResourceMap: () =>
          Object.fromEntries(
            Object.entries(playback.getResourceMap()).map(([id, url]) => [
              url,
              id,
            ])
          ),
        getEventsByType: (types, opts) => {
          const events = playback.getSourceEvents()
          const results: Array<SourceEvent> = []
          const offset = opts?.offset ?? 0
          const limit = opts?.limit ?? Infinity
          let count = 0
          let skipped = 0
          for (let i = 0, len = events.size(); i < len; i++) {
            const event = events.over(i)
            if (!event) continue
            const type = event.get('type').orElse(-1)
            if (!types.includes(type as SourceEventType)) continue
            const time = event.get('time').orElse(0)
            if (opts?.startMs !== undefined && time < opts.startMs) continue
            if (opts?.endMs !== undefined && time > opts.endMs) continue
            if (skipped < offset) {
              skipped++
              continue
            }
            if (count >= limit) break
            results.push(event as unknown as SourceEvent)
            count++
          }
          return results
        },
        getEventsInRange: (startMs, endMs, opts) => {
          const events = playback.getSourceEvents()
          const results: Array<SourceEvent> = []
          const offset = opts?.offset ?? 0
          const limit = opts?.limit ?? Infinity
          let count = 0
          let skipped = 0
          for (let i = 0, len = events.size(); i < len; i++) {
            const event = events.over(i)
            if (!event) continue
            const time = event.get('time').orElse(0)
            if (time < startMs) continue
            if (time > endMs) break
            if (opts?.types && opts.types.length > 0) {
              const type = event.get('type').orElse(-1)
              if (!opts.types.includes(type as SourceEventType)) continue
            }
            if (skipped < offset) {
              skipped++
              continue
            }
            if (count >= limit) break
            results.push(event as unknown as SourceEvent)
            count++
          }
          return results
        },
      }),
    [streamProvider, playback]
  )

  return (
    <AgenticStateContext.Provider value={state}>
      <AgenticView />
    </AgenticStateContext.Provider>
  )
}
