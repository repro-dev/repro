import { zodResolver } from '@hookform/resolvers/zod'
import { Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession } from '@repro/auth'
import {
  Alert,
  Avatar,
  Badge,
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
  radius,
  spacing,
  useConfirm,
} from '@repro/design'
import { ProjectRole } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import {
  ProjectMember,
  deactivateProject as defaultDeactivateProject,
  getProjectMembers as defaultGetProjectMembers,
  renameProject as defaultRenameProject,
} from '@repro/workspace-api'
import { fork } from 'fluture'
import React, { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useProjectContext } from '~/ProjectContext'

const renameSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
})

type RenameFormValues = typeof renameSchema._output

interface ProjectSettingsRouteProps {
  // Injected for testing; defaults to the real workspace-api functions
  currentUserId: string
  projectName: string
  getMembers?: typeof defaultGetProjectMembers
  renameProject?: typeof defaultRenameProject
  deactivateProject?: typeof defaultDeactivateProject
}

export function ProjectSettingsRoute({
  currentUserId,
  projectName,
  getMembers = defaultGetProjectMembers,
  renameProject = defaultRenameProject,
  deactivateProject = defaultDeactivateProject,
}: ProjectSettingsRouteProps) {
  const { projectId = '' } = useParams()
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [renameError, setRenameError] = useState(null as string | null)
  const [archiveError, setArchiveError] = useState(null as string | null)

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

  useEffect(() => {
    reset({ name: projectName })
  }, [projectName, reset])

  const onRename = useCallback(
    (values: RenameFormValues) => {
      setRenameError(null)
      return new Promise((resolve: (value: void) => void) => {
        renameProject(apiClient, projectId, values.name).pipe(
          fork((err: unknown) => {
            setRenameError(
              (err as Error).message ??
                'Failed to rename project. Please try again.'
            )
            resolve(undefined)
          })(() => {
            // Reset form to the saved value so isDirty becomes false
            reset({ name: values.name })
            resolve(undefined)
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

          {/* Team Members section */}
          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Row alignItems="center" justifyContent="space-between">
                <Text variant="heading3">Team Members</Text>
                <Badge context="neutral" rounded>
                  {members.length} member{members.length !== 1 ? 's' : ''}
                </Badge>
              </Row>

              {members.length === 0 ? (
                <Text variant="body" color={color.text.muted}>
                  No members found.
                </Text>
              ) : (
                <Col gap={spacing.sm}>
                  {members.map((member: ProjectMember) => {
                    const isCurrentUser = member.user.id === currentUserId
                    return (
                      <Row
                        key={member.user.id}
                        alignItems="center"
                        gap={spacing.md}
                        padding={spacing.md}
                        borderRadius={radius.sm}
                        backgroundColor={
                          isCurrentUser ? color.bg.hover : undefined
                        }
                      >
                        <Avatar
                          email={member.user.email}
                          name={member.user.name}
                          size={36}
                          mode="image-only"
                        />
                        <Col flex={1} gap={spacing.xs}>
                          <Row alignItems="center" gap={spacing.sm}>
                            <Text variant="body" weight="semibold">
                              {member.user.name}
                            </Text>
                            {isCurrentUser && (
                              <Badge context="info" size="small" rounded>
                                You
                              </Badge>
                            )}
                          </Row>
                          <Text variant="bodySmall" color={color.text.muted}>
                            {member.user.email}
                          </Text>
                        </Col>
                        <Badge context="neutral">
                          {member.role.charAt(0).toUpperCase() +
                            member.role.slice(1)}
                        </Badge>
                      </Row>
                    )
                  })}
                </Col>
              )}
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
  const { projectId = '' } = useParams()
  const { loading, projects } = useProjectContext()
  const project = projects.find(candidate => candidate.id === projectId)

  if (!session || loading) {
    return <FullPageLoading />
  }

  return (
    <ProjectSettingsRoute
      currentUserId={session.id}
      projectName={project?.name ?? ''}
    />
  )
}
