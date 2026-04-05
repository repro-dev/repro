import { Col } from '@jsxstyle/react'
import {
  Button,
  EmptyState,
  FullPageLoading,
  PageFrame,
  spacing,
} from '@repro/design'
import { PuzzleIcon } from 'lucide-react'
import React from 'react'
import { useDetectExtension } from '~/hooks/useDetectExtension'

// The real Chrome Web Store listing for the Repro capture extension.
const CHROME_WEB_STORE_URL =
  'https://chrome.google.com/webstore/detail/repro/ecmbphfjfhnifmhbjhpejbpdnpanpice'

export const HomeRoute: React.FC = () => {
  const { hasExtension, loading } = useDetectExtension()

  // While detection is in flight, show nothing so we never flash the install
  // prompt to users who do have the extension installed.
  if (loading) {
    return <FullPageLoading />
  }

  // Extension detected — session list will be implemented in REP-488.
  if (hasExtension) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Sessions</PageFrame.Title>
        </PageFrame.Header>

        <PageFrame.Body>
          <EmptyState>
            <EmptyState.Title>No sessions yet</EmptyState.Title>
            <EmptyState.Description>
              Start recording in the browser to capture your first session.
            </EmptyState.Description>
          </EmptyState>
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
