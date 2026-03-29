import {
  EXTENSION_SYSTEM_CARD_MESSAGE,
  createAgenticState,
  makeAccessorFromEventList,
  type Context,
  type StreamProvider,
  type ToolDefinition,
} from '@repro/agentic'
import { AgenticStateContext, AgenticView } from '@repro/agentic-ui'
import { useApiClient } from '@repro/api-client'
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
        ...makeAccessorFromEventList(playback.getSourceEvents()),
      }),
    [streamProvider, playback]
  )

  return (
    <AgenticStateContext.Provider value={state}>
      <AgenticView />
    </AgenticStateContext.Provider>
  )
}
