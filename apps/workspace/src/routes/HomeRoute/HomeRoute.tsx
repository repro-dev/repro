import { Col, Grid } from '@jsxstyle/react'
import { ApiClient, useApiClient } from '@repro/api-client'
import { Button, EmptyState, PageFrame, spacing } from '@repro/design'
import { RecordingInfo } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { getProjectRecordings as defaultGetProjectRecordings } from '@repro/workspace-api'
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

interface Props {
  // Injectable for testing; defaults to the real workspace-api function.
  getProjectRecordings?: (
    apiClient: ApiClient,
    projectId: string
  ) => FutureInstance<Error, Array<RecordingInfo>>
}

export const HomeRoute: React.FC<Props> = ({
  getProjectRecordings = defaultGetProjectRecordings,
}) => {
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
  }, [apiClient, projectId, getProjectRecordings])

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
        <PageFrame.Title>Sessions ({items.length})</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body>
        <Grid
          gridTemplateColumns="repeat(auto-fill, minmax(320px, 1fr))"
          gap={spacing.md}
        >
          {items.map(recording => (
            <RecordingTile
              key={recording.id}
              recording={recording}
              projectId={projectId!}
            />
          ))}
        </Grid>
      </PageFrame.Body>
    </PageFrame>
  )
}
