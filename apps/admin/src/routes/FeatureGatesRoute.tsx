import { EmptyState, PageFrame } from '@repro/design'
import React from 'react'

export const FeatureGatesRoute: React.FC = () => {
  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Feature Gates</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <EmptyState>
          <EmptyState.Title>Coming Soon</EmptyState.Title>
          <EmptyState.Description>
            Feature gates management is coming soon.
          </EmptyState.Description>
        </EmptyState>
      </PageFrame.Body>
    </PageFrame>
  )
}
