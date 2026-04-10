import { zodResolver } from '@hookform/resolvers/zod'
import { Col, Row } from '@jsxstyle/react'
import { ApiClient, useApiClient } from '@repro/api-client'
import { useSession } from '@repro/auth'
import {
  Alert,
  Button,
  Card,
  FormField,
  FormFieldError,
  FullPageLoading,
  Input,
  Label,
  PageFrame,
  Stack,
  Text,
  color,
  spacing,
  useConfirm,
} from '@repro/design'
import { Project, ProjectRole } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import {
  ProjectMember,
  deactivateProject as defaultDeactivateProject,
  getProjectMembers as defaultGetProjectMembers,
  renameProject as defaultRenameProject,
} from '@repro/workspace-api'
import { FutureInstance, fork } from 'fluture'
import React, { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useProjectContext } from '~/ProjectContext'

const renameSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
})

type RenameFormValues = z.infer<typeof renameSchema>

interface ProjectSettingsRouteProps {
  // Injected for testing; defaults to the real workspace-api functions
  currentUserId: string
  projectName: string
  getMembers?: (
    apiClient: ApiClient,
    projectId: string
  ) => FutureInstance<Error, ProjectMember[]>
  renameProject?: (
    apiClient: ApiClient,
    projectId: string,
    name: string
  ) => FutureInstance<Error, Project>
  deactivateProject?: (
    apiClient: ApiClient,
    projectId: string
  ) => FutureInstance<Error, void>
}

export const ProjectSettingsRoute: React.FC<ProjectSettingsRouteProps> = ({
  currentUserId,
  projectName,
  getMembers = defaultGetProjectMembers,
  renameProject = defaultRenameProject,
  deactivateProject = defaultDeactivateProject,
}) => {
  const { projectId = '' } = useParams()
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [renameError, setRenameError] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const {
    loading,
    data: members,
    error: membersError,
  } = useFuture(
    () => getMembers(apiClient, projectId),
    [apiClient, projectId, getMembers]
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: projectName },
  })

  const onRename = useCallback(
    (values: RenameFormValues) => {
      setRenameError(null)
      return new Promise<void>(resolve => {
        renameProject(apiClient, projectId, values.name).pipe(
          fork((err: unknown) => {
            setRenameError(
              (err as Error).message ??
                'Failed to rename project. Please try again.'
            )
            resolve()
          })(() => {
            // Reset form to the saved value so isDirty becomes false
            reset({ name: values.name })
            resolve()
          })
        )
      })
    },
    [apiClient, projectId, renameProject, reset]
  )

  const handleArchive = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Archive Project',
      description:
        'This will permanently archive the project. Re-activation is not supported. All project data will be retained but the project will no longer be accessible.',
      confirmLabel: 'Archive',
      variant: 'destructive',
    })

    if (!confirmed) {
      return
    }

    setArchiveError(null)
    deactivateProject(apiClient, projectId).pipe(
      fork(() => {
        setArchiveError('Failed to archive project. Please try again.')
      })(() => {
        navigate('/')
      })
    )
  }, [apiClient, projectId, deactivateProject, confirm, navigate])

  if (loading) {
    return <FullPageLoading />
  }

  // Distinguish a fetch/network error from a permission failure so we don't
  // mislead the user with an authorization message when the real cause is a
  // server or network problem.
  if (membersError) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Project Settings</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Alert type="danger">
            Failed to load project membership. Please try refreshing the page.
          </Alert>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  const currentMember = (members ?? []).find(
    (m: ProjectMember) => m.user.id === currentUserId
  )
  const isAdmin = currentMember?.role === ProjectRole.Admin

  if (!isAdmin) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Project Settings</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Alert type="warning">
            You don&apos;t have permission to manage project settings. Only
            project admins can access this page.
          </Alert>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Project Settings</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body maxWidth={720}>
        <Stack gap="lg">
          {/* Rename section */}
          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Text variant="heading3">Rename Project</Text>

              <form onSubmit={handleSubmit(onRename)}>
                <Stack gap="md">
                  {renameError && <Alert type="danger">{renameError}</Alert>}

                  <FormField>
                    <Label htmlFor="project-name">Project name</Label>
                    <Input
                      id="project-name"
                      context={errors.name ? 'error' : 'normal'}
                      aria-describedby={
                        errors.name ? 'project-name-error' : undefined
                      }
                      {...register('name')}
                    />
                    {errors.name && (
                      <FormFieldError
                        id="project-name-error"
                        error={errors.name}
                      />
                    )}
                  </FormField>

                  <Row justifyContent="flex-end">
                    <Button
                      variant="contained"
                      context="info"
                      type="submit"
                      disabled={!isDirty || isSubmitting}
                    >
                      Save
                    </Button>
                  </Row>
                </Stack>
              </form>
            </Col>
          </Card>

          {/* Archive section */}
          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Text variant="heading3">Archive Project</Text>

              <Text variant="body" color={color.text.muted}>
                Archiving a project is permanent. The project will no longer be
                accessible to team members. Re-activation is not currently
                supported.
              </Text>

              <Row>
                <Button
                  variant="outlined"
                  context="danger"
                  onClick={handleArchive}
                >
                  Archive Project
                </Button>
              </Row>

              {archiveError && <Alert type="danger">{archiveError}</Alert>}
            </Col>
          </Card>
        </Stack>
      </PageFrame.Body>
    </PageFrame>
  )
}

/**
 * Connected wrapper that sources currentUserId and projectName from context
 * hooks. This is the default export used by the lazy-loaded route in index.tsx.
 */
export function ProjectSettingsRouteConnected() {
  const session = useSession()
  const { selectedProject } = useProjectContext()

  // Wait for session and project to be available before rendering
  if (!session || !selectedProject) {
    return <FullPageLoading />
  }

  return (
    <ProjectSettingsRoute
      currentUserId={session.id}
      projectName={selectedProject.name}
    />
  )
}
