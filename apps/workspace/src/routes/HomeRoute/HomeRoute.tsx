import { Col } from '@jsxstyle/react'
import { Button, EmptyState, PageFrame, spacing } from '@repro/design'
import { PuzzleIcon } from 'lucide-react'
import React from 'react'

// The real Chrome Web Store listing for the Repro capture extension.
const CHROME_WEB_STORE_URL =
  'https://chrome.google.com/webstore/detail/repro/ecmbphfjfhnifmhbjhpejbpdnpanpice'

export const HomeRoute: React.FC = () => (
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
