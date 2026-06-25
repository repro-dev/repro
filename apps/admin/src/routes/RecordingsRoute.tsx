import { EmptyState, PageFrame } from '@repro/design'
import React from 'react'

export const RecordingsRoute: React.FC = () => {
  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Recordings</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <EmptyState>
          <EmptyState.Title>Coming Soon</EmptyState.Title>
          <EmptyState.Description>
            Recordings list is coming soon.
          </EmptyState.Description>
        </EmptyState>
      </PageFrame.Body>
    </PageFrame>
  )
}
