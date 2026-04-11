import { Col } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { Button, EmptyState, PageFrame, spacing } from '@repro/design'
import { RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { getProjectRecordings } from '@repro/workspace-api'
import { FutureInstance, resolve } from 'fluture'
import { PuzzleIcon } from 'lucide-react'
import React from 'react'
import { useProjectContext } from '~/ProjectContext'
import { RecordingTile } from './RecordingTile'

// The real Chrome Web Store listing for the Repro capture extension.
const CHROME_WEB_STORE_URL =
  'https://chrome.google.com/webstore/detail/repro/ecmbphfjfhnifmhbjhpejbpdnpanpice'

// An immediately-resolved empty list, typed to match getProjectRecordings.
const emptyRecordings: FutureInstance<unknown, RecordingInfo[]> = resolve([])

export const HomeRoute: React.FC = () => {
  const apiClient = useApiClient()
  const { selectedProject } = useProjectContext()

  const projectId = selectedProject?.id ?? null

  // Re-fetch whenever the selected project changes.
  const { loading, data: recordings } = useFuture<
    unknown,
    RecordingInfo[]
  >(() => {
    if (!projectId) {
      // No project selected — resolve immediately with an empty list so the
      // empty state renders rather than hanging in a loading state.
      return emptyRecordings
    }
    return getProjectRecordings(apiClient, projectId)
  }, [apiClient, projectId])

  const items: RecordingInfo[] = recordings ?? []

  if (loading) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Sessions</PageFrame.Title>
        </PageFrame.Header>
      </PageFrame>
    )
  }

  if (items.length === 0) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Sessions</PageFrame.Title>
        </PageFrame.Header>

        <PageFrame.Body>
          <EmptyState>
            <EmptyState.Icon>
              <PuzzleIcon size={48} />
            </EmptyState.Icon>

            <EmptyState.Title>Install the Repro extension</EmptyState.Title>

            <EmptyState.Description>
              The Repro browser extension captures your sessions so you can
              replay them later, share them with your team, and debug issues
              faster. Install it from the Chrome Web Store to get started.
            </EmptyState.Description>

            <EmptyState.Action>
              <Col gap={spacing.sm} alignItems="center">
                <Button
                  variant="contained"
                  context="info"
                  size="large"
                  onClick={() =>
                    window.open(
                      CHROME_WEB_STORE_URL,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
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

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Sessions</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body>
        <Col gap={spacing.md}>
          {items.map(recording => (
            <RecordingTile key={recording.id} recording={recording} />
          ))}
        </Col>
      </PageFrame.Body>
    </PageFrame>
  )
}
