import { Col } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Button,
  EmptyState,
  FullPageError,
  FullPageLoading,
  PageFrame,
  spacing,
} from '@repro/design'
import { ListResponse, RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { PuzzleIcon } from 'lucide-react'
import React from 'react'
import { useDetectExtension } from '~/hooks/useDetectExtension'
import { RecordingTile } from './RecordingTile'

// The real Chrome Web Store listing for the Repro capture extension.
const CHROME_WEB_STORE_URL =
  'https://chrome.google.com/webstore/detail/repro/ecmbphfjfhnifmhbjhpejbpdnpanpice'

export const HomeRoute: React.FC = () => {
  const { hasExtension, loading } = useDetectExtension()
  const apiClient = useApiClient()

  const recordingsResult = useFuture(
    () => apiClient.fetch<ListResponse<RecordingInfo>>('/recordings'),
    [apiClient]
  )

  // While detection is in flight, show nothing so we never flash the install
  // prompt to users who do have the extension installed.
  if (loading) {
    return <FullPageLoading />
  }

  // Extension detected — render the session list inline (this route IS the
  // session list; there is no separate /recordings route in the workspace app).
  if (hasExtension) {
    if (recordingsResult.loading) {
      return <FullPageLoading />
    }

    if (recordingsResult.error) {
      return (
        <FullPageError
          title="Unable to load sessions"
          description="Something went wrong while loading your sessions. Please try again later."
        />
      )
    }

    const recordings = recordingsResult.data!.items

    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Sessions</PageFrame.Title>
        </PageFrame.Header>

        <PageFrame.Body>
          {recordings.length === 0 ? (
            <EmptyState>
              <EmptyState.Title>No sessions yet</EmptyState.Title>
              <EmptyState.Description>
                Start recording in the browser to capture your first session.
              </EmptyState.Description>
            </EmptyState>
          ) : (
            <Col gap={spacing.md}>
              {recordings.map(recording => (
                <RecordingTile key={recording.id} recording={recording} />
              ))}
            </Col>
          )}
        </PageFrame.Body>
      </PageFrame>
    )
  }

  // Extension not installed — render the install prompt.
  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Get started</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body>
        <EmptyState>
          <EmptyState.Icon>
            <PuzzleIcon size={48} />
          </EmptyState.Icon>

          <EmptyState.Title>Install the Repro extension</EmptyState.Title>

          <EmptyState.Description>
            The Repro browser extension captures your sessions so you can replay
            them later, share them with your team, and debug issues faster.
            Install it from the Chrome Web Store to get started.
          </EmptyState.Description>

          <EmptyState.Action>
            <Col gap={spacing.sm} alignItems="center">
              <Button
                variant="contained"
                context="info"
                size="large"
                onClick={() => window.open(CHROME_WEB_STORE_URL, '_blank')}
              >
                Add to Chrome
              </Button>
            </Col>
          </EmptyState.Action>
        </EmptyState>
      </PageFrame.Body>
    </PageFrame>
  )
}
