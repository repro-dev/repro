import { EmptyState, PageFrame } from '@repro/design'
import { FolderIcon } from 'lucide-react'
import React from 'react'

const ProjectsRoute: React.FC = () => {
  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Projects</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body>
        <EmptyState>
          <EmptyState.Icon>
            <FolderIcon size={48} />
          </EmptyState.Icon>

          <EmptyState.Title>No projects yet</EmptyState.Title>

          <EmptyState.Description>
            Projects help you organize your sessions. Create a project to get
            started.
          </EmptyState.Description>
        </EmptyState>
      </PageFrame.Body>
    </PageFrame>
  )
}

export default ProjectsRoute
