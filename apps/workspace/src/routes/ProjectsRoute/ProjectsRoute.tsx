import { Col } from '@jsxstyle/react'
import {
  Button,
  Card,
  EmptyState,
  PageFrame,
  Skeleton,
  spacing,
  Table,
} from '@repro/design'
import { FolderIcon } from 'lucide-react'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreateProjectDialog } from '~/components/CreateProjectDialog'
import { useProjectContext } from '~/ProjectContext'

export const ProjectsRoute: React.FC = () => {
  const { projects, loading, selectProject } = useProjectContext()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const navigate = useNavigate()

  const openProject = (projectId: string) => {
    selectProject(projectId)
    navigate('/')
  }

  if (loading) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Projects</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <Card fullBleed>
            <Table aria-label="Loading projects">
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    <Skeleton variant="text" width={200} />
                  </Table.HeaderCell>
                  <Table.HeaderCell width={100}>
                    <Skeleton variant="text" width={80} />
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {Array.from({ length: 5 }, (_, i) => (
                  <Table.Row key={i}>
                    <Table.Cell>
                      <Skeleton variant="text" width="80%" />
                    </Table.Cell>
                    <Table.Cell>
                      <Skeleton variant="text" width="50%" />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Card>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  if (projects.length === 0) {
    return (
      <>
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
                Projects help you organize your sessions. Create a project to
                get started.
              </EmptyState.Description>

              <EmptyState.Action>
                <Button
                  variant="contained"
                  context="info"
                  onClick={() => setShowCreateDialog(true)}
                >
                  Create project
                </Button>
              </EmptyState.Action>
            </EmptyState>
          </PageFrame.Body>
        </PageFrame>

        <CreateProjectDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      </>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Projects</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body>
        <Col gap={spacing.lg}>
          <Button
            variant="outlined"
            context="neutral"
            onClick={() => setShowCreateDialog(true)}
          >
            Create project
          </Button>

          <Table aria-label="Projects" density="compact">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Project</Table.HeaderCell>
                <Table.HeaderCell>Action</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {projects.map(project => (
                <Table.Row key={project.id}>
                  <Table.Cell>{project.name}</Table.Cell>
                  <Table.Cell>
                    <Button
                      variant="outlined"
                      context="neutral"
                      size="small"
                      onClick={() => openProject(project.id)}
                    >
                      Open sessions
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Col>
      </PageFrame.Body>

      <CreateProjectDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </PageFrame>
  )
}
