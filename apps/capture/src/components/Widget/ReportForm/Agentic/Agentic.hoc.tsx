import {
  EXTENSION_SYSTEM_CARD_MESSAGE,
  createAgenticState,
  extensionTools,
  makeAccessorFromEventList,
  type Context,
  type RecordingMeta,
  type StreamProvider,
  type ToolDefinition,
} from '@repro/agentic'
import { AgenticStateContext, AgenticView } from '@repro/agentic-ui'
import { useApiClient } from '@repro/api-client'
import { createSourcePlayback, usePlayback } from '@repro/playback'
import { detect } from 'detect-browser'
import { parse } from 'event-stream-parser'
import { attemptP, chain, fork } from 'fluture'
import React, { useEffect, useMemo } from 'react'
import type { RecordingActions } from '../../CaptureReview/useRecordingActions'

async function hashPromptVersion(prompt: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(prompt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16) // 16 hex chars (64 bits) is enough for version identification
}

interface AgenticProps {
  getSelectedRecording: RecordingActions['getSelectedRecording']
  onInvestigationComplete?: (summary: string) => void
}

export const Agentic: React.FC<AgenticProps> = ({
  getSelectedRecording,
  onInvestigationComplete,
}) => {
  const apiClient = useApiClient()
  const playback = usePlayback()
  const selected = useMemo(() => getSelectedRecording(), [getSelectedRecording])

  const recordingMeta: RecordingMeta | null = useMemo(() => {
    const browserInfo = detect()
    return {
      browser: browserInfo?.name ?? null,
      durationMs: selected.duration,
      recordingUrl: null,
    }
  }, [selected.duration])

  const streamProvider: StreamProvider = useMemo(
    () =>
      (context: Context, toolDefs: ToolDefinition[], signal?: AbortSignal) => {
        const response = apiClient.fetch(
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

  const state = useMemo(() => {
    return createAgenticState(
      streamProvider,
      {
        getDuration: () => selected.duration,
        getSnapshotAtTime: (timestampMs: number) => {
          const pb = createSourcePlayback(
            selected.events,
            selected.duration,
            selected.resourceMap
          )
          pb.seekToTime(timestampMs)
          return pb.getSnapshot()
        },
        // Invert from Record<resourceId, absoluteURL> to
        // Record<absoluteURL, resourceId>. In the capture widget the resource
        // map is always empty (resources aren't fetched client-side), so this
        // produces {} in practice — see REP-XXX for the follow-up.
        getResourceMap: () =>
          Object.fromEntries(
            Object.entries(selected.resourceMap).map(([id, url]) => [url, id])
          ),
        ...makeAccessorFromEventList(selected.events),
      },
      // captureScreenshot is excluded from the extension agent until it has
      // been tested and refined in this context.
      { tools: extensionTools }
    )
  }, [streamProvider, selected])

  useEffect(() => () => state.destroy(), [state])

  return (
    <AgenticStateContext.Provider value={state}>
      <AgenticView
        recordingMeta={recordingMeta}
        onInvestigationComplete={onInvestigationComplete}
        onGoToTime={timestampMs =>
          playback.seekToTime(selected.startTimeMs + timestampMs)
        }
        onFeedback={sentiment => {
          // Fire-and-forget — no error handling beyond a console.warn
          fork(() => console.warn('[Agentic] feedback submission failed'))(
            () => undefined
          )(
            attemptP(() =>
              hashPromptVersion(EXTENSION_SYSTEM_CARD_MESSAGE)
            ).pipe(
              chain(promptVersion =>
                apiClient.fetch(
                  '/agentic/feedback',
                  {
                    method: 'POST',
                    body: JSON.stringify({ sentiment, promptVersion }),
                  },
                  'json',
                  'json'
                )
              )
            )
          )
        }}
      />
    </AgenticStateContext.Provider>
  )
}
