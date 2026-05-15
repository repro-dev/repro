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
  Modal,
  PageFrame,
  Select,
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
  inviteProjectMember as defaultInviteProjectMember,
  removeProjectMember as defaultRemoveProjectMember,
  renameProject as defaultRenameProject,
  updateProjectMemberRole as defaultUpdateProjectMemberRole,
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

const projectRoleOptions = [
  { value: ProjectRole.Admin, label: 'Admin' },
  { value: ProjectRole.Contributor, label: 'Contributor' },
  { value: ProjectRole.Viewer, label: 'Viewer' },
] as const

function formatRole(role: ProjectRole) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

type RenameFormValues = typeof renameSchema._output

interface ProjectSettingsRouteProps {
  // Injected for testing; defaults to the real workspace-api functions
  currentUserId: string
  projectName: string
  getMembers?: typeof defaultGetProjectMembers
  inviteMember?: typeof defaultInviteProjectMember
  updateMemberRole?: typeof defaultUpdateProjectMemberRole
  removeMember?: typeof defaultRemoveProjectMember
  renameProject?: typeof defaultRenameProject
  deactivateProject?: typeof defaultDeactivateProject
}

export function ProjectSettingsRoute({
  currentUserId,
  projectName,
  getMembers = defaultGetProjectMembers,
  inviteMember = defaultInviteProjectMember,
  updateMemberRole = defaultUpdateProjectMemberRole,
  removeMember = defaultRemoveProjectMember,
  renameProject = defaultRenameProject,
  deactivateProject = defaultDeactivateProject,
}: ProjectSettingsRouteProps) {
  const { projectId = '' } = useParams()
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [renameError, setRenameError] = useState(null as string | null)
  const [archiveError, setArchiveError] = useState(null as string | null)
  const [memberActionError, setMemberActionError] = useState(
    null as string | null
  )
  const [inviteError, setInviteError] = useState(null as string | null)
  const [inviteSuccess, setInviteSuccess] = useState(null as string | null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<ProjectRole>(
    ProjectRole.Contributor
  )
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [membersInitialized, setMembersInitialized] = useState(false)

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

  useEffect(() => {
    if (members != null) {
      setProjectMembers(members)
      setMembersInitialized(true)
    }
  }, [members])

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

  const handleInviteSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const email = inviteEmail.trim()
      if (email.length === 0) {
        setInviteError('Email is required')
        return
      }

      setInviteError(null)
      setInviteSuccess(null)

      inviteMember(apiClient, email, inviteRole).pipe(
        fork((err: unknown) => {
          setInviteError(
            (err as Error).message ??
              'Failed to invite member. Please try again.'
          )
        })(() => {
          setInviteEmail('')
          setInviteRole(ProjectRole.Contributor)
          setInviteModalOpen(false)
          setInviteSuccess(
            `Invitation sent to ${email}. Role selection is currently UI-only until the backend contract expands.`
          )
        })
      )
    },
    [apiClient, inviteEmail, inviteMember, inviteRole]
  )

  const handleUpdateMemberRole = useCallback(
    (member: ProjectMember, role: ProjectRole) => {
      if (member.user.id === currentUserId || member.role === role) {
        return
      }

      setMemberActionError(null)

      updateMemberRole(apiClient, projectId, member.user.id, role).pipe(
        fork((err: unknown) => {
          setMemberActionError(
            (err as Error).message ?? 'Failed to update member role.'
          )
        })(() => {
          setProjectMembers(currentMembers =>
            currentMembers.map(currentMember =>
              currentMember.user.id === member.user.id
                ? { ...currentMember, role }
                : currentMember
            )
          )
        })
      )
    },
    [apiClient, currentUserId, projectId, updateMemberRole]
  )

  const handleRemoveMember = useCallback(
    async (member: ProjectMember) => {
      if (member.user.id === currentUserId) {
        return
      }

      const confirmed = await confirm({
        title: 'Remove Member',
        description: `Remove ${member.user.name} from this project? They will lose access immediately.`,
        confirmLabel: 'Remove',
        variant: 'destructive',
      })

      if (!confirmed) {
        return
      }

      setMemberActionError(null)

      removeMember(apiClient, projectId, member.user.id).pipe(
        fork((err: unknown) => {
          setMemberActionError(
            (err as Error).message ?? 'Failed to remove member.'
          )
        })(() => {
          setProjectMembers(currentMembers =>
            currentMembers.filter(
              currentMember => currentMember.user.id !== member.user.id
            )
          )
        })
      )
    },
    [apiClient, confirm, currentUserId, projectId, removeMember]
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

  const visibleMembers = membersInitialized ? projectMembers : members ?? []

  const currentMember = visibleMembers.find(
    (m: ProjectMember) => m.user.id === currentUserId
  )
  const isAdmin = currentMember?.role === ProjectRole.Admin

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Project Settings</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body maxWidth={720}>
        <Stack gap="lg">
          {isAdmin && (
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
          )}

          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Row
                alignItems="center"
                justifyContent="space-between"
                gap={spacing.md}
              >
                <Col gap={spacing.xs}>
                  <Text variant="heading3">Team Members</Text>
                  {!isAdmin && (
                    <Text variant="bodySmall" color={color.text.muted}>
                      Read-only for project members who aren&apos;t admins.
                    </Text>
                  )}
                </Col>
                <Row alignItems="center" gap={spacing.sm}>
                  <Badge context="neutral" rounded>
                    {visibleMembers.length} member
                    {visibleMembers.length !== 1 ? 's' : ''}
                  </Badge>
                  {isAdmin && (
                    <Button
                      variant="contained"
                      context="info"
                      size="medium"
                      rounded
                      onClick={() => {
                        setInviteError(null)
                        setInviteModalOpen(true)
                      }}
                    >
                      Invite member
                    </Button>
                  )}
                </Row>
              </Row>

              {inviteSuccess && <Alert type="success">{inviteSuccess}</Alert>}
              {inviteError && <Alert type="danger">{inviteError}</Alert>}
              {memberActionError && (
                <Alert type="danger">{memberActionError}</Alert>
              )}

              {visibleMembers.length === 0 ? (
                <Text variant="body" color={color.text.muted}>
                  No members found.
                </Text>
              ) : (
                <Col gap={spacing.sm}>
                  {visibleMembers.map((member: ProjectMember) => {
                    const isCurrentUser = member.user.id === currentUserId
                    return (
                      <Row
                        key={member.user.id}
                        alignItems="center"
                        gap={spacing.md}
                        padding={spacing.md}
                        borderRadius={radius.sm}
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
                        {isAdmin && !isCurrentUser ? (
                          <Row alignItems="center" gap={spacing.sm}>
                            <Select
                              aria-label={`Role for ${member.user.name}`}
                              value={member.role}
                              options={projectRoleOptions.map(option => ({
                                value: option.value,
                                label: option.label,
                              }))}
                              onChange={nextRole =>
                                handleUpdateMemberRole(
                                  member,
                                  nextRole as ProjectRole
                                )
                              }
                            />
                            <Button
                              variant="outlined"
                              context="danger"
                              size="medium"
                              rounded
                              onClick={() => {
                                void handleRemoveMember(member)
                              }}
                            >
                              Remove
                            </Button>
                          </Row>
                        ) : (
                          <Badge context="neutral">
                            {formatRole(member.role)}
                          </Badge>
                        )}
                      </Row>
                    )
                  })}
                </Col>
              )}
            </Col>
          </Card>

          {isAdmin && (
            <Card>
              <Col padding={spacing.xl} gap={spacing.lg}>
                <Text variant="heading3">Archive Project</Text>

                <Text variant="body" color={color.text.muted}>
                  Archiving a project is permanent. The project will no longer
                  be accessible to team members. Re-activation is not currently
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
          )}

          <Modal
            width={520}
            height="auto"
            open={inviteModalOpen}
            onClose={() => setInviteModalOpen(false)}
            aria-label="Invite member"
          >
            <Modal.Body>
              <Col gap={spacing.lg}>
                <Modal.Header
                  title="Invite member"
                  description="Invite someone to join this project by email."
                />

                <form onSubmit={handleInviteSubmit}>
                  <Stack gap="md">
                    <FormField>
                      <Label htmlFor="invite-email">Email</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={event => setInviteEmail(event.target.value)}
                        placeholder="name@example.com"
                      />
                    </FormField>

                    <FormField>
                      <Label htmlFor="invite-role">Role</Label>
                      <Select
                        id="invite-role"
                        aria-label="Invite role"
                        value={inviteRole}
                        options={projectRoleOptions.map(option => ({
                          value: option.value,
                          label: option.label,
                        }))}
                        onChange={value => setInviteRole(value as ProjectRole)}
                      />
                    </FormField>

                    <Text variant="bodySmall" color={color.text.muted}>
                      The selected role is currently kept in the UI only.
                    </Text>

                    <Row justifyContent="flex-end" gap={spacing.sm}>
                      <Button
                        variant="outlined"
                        context="neutral"
                        size="medium"
                        rounded
                        type="button"
                        onClick={() => setInviteModalOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="contained"
                        context="info"
                        size="medium"
                        rounded
                        type="submit"
                      >
                        Send invite
                      </Button>
                    </Row>
                  </Stack>
                </form>
              </Col>
            </Modal.Body>
          </Modal>
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
