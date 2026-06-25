import { EmptyState, PageFrame } from '@repro/design'
import React from 'react'

export const StaffUsersRoute: React.FC = () => {
  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Staff Users</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <EmptyState>
          <EmptyState.Title>Coming Soon</EmptyState.Title>
          <EmptyState.Description>
            Staff user management is coming soon.
          </EmptyState.Description>
        </EmptyState>
      </PageFrame.Body>
    </PageFrame>
  )
}
