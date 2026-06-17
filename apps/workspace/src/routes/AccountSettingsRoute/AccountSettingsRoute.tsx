import { Block, Col, Grid, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession, useSessionLoading } from '@repro/auth'
import {
  /* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
  Alert,
  Avatar,
  Button,
  Card,
  FormField,
  FormFieldError,
  FullPageLoading,
  Input,
  Label,
  Link,
  Modal,
  PageFrame,
  Table,
  Text,
  color,
  radius,
  spacing,
} from '@repro/design'
import { useFuture } from '@repro/future-utils'
import {
  deleteAccount as deleteWorkspaceAccount,
  getAccountSettings as getWorkspaceAccountSettings,
  renameAccount as renameWorkspaceAccount,
} from '@repro/workspace-api'
import { fork } from 'fluture'
import React, { useCallback, useEffect, useState } from 'react'
import { Navigate, Link as RouterLink } from 'react-router-dom'

type ActionRowProps = {
  label: string
  description: string
  control: React.ReactNode
}

function ActionRow({ label, description, control }: ActionRowProps) {
  return (
    <Grid
      gridTemplateColumns="minmax(0, 1fr) auto"
      gap={spacing.lg}
      alignItems="center"
    >
      <Col gap={spacing.xs} minWidth={0}>
        <Text variant="label" as="span" color={color.text.label}>
          {label}
        </Text>
        <Text variant="bodySmall" as="span" color={color.text.muted}>
          {description}
        </Text>
      </Col>

      {control}
    </Grid>
  )
}

const desktopViewportQuery = '(min-width: 1024px)'

function useIsDesktopViewport() {
  const [isDesktop, setIsDesktop] = useState(() => {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(desktopViewportQuery).matches
    )
  })

  React.useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return
    }

    const mediaQueryList = window.matchMedia(desktopViewportQuery)
    const updateMatches = () => setIsDesktop(mediaQueryList.matches)

    updateMatches()

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', updateMatches)

      return () => {
        mediaQueryList.removeEventListener('change', updateMatches)
      }
    }

    mediaQueryList.addListener(updateMatches)

    return () => {
      mediaQueryList.removeListener(updateMatches)
    }
  }, [])

  return isDesktop
}

function SettingsContent({ children }: React.PropsWithChildren) {
  const isDesktop = useIsDesktopViewport()

  return (
    <Col
      component="section"
      gap={spacing['3xl']}
      width="100%"
      props={{
        style: {
          maxWidth: isDesktop ? '66.666%' : '100%',
        },
      }}
    >
      {children}
    </Col>
  )
}

interface AccountSettingsRouteProps {
  getAccountSettings?: typeof getWorkspaceAccountSettings
  renameAccount?: typeof renameWorkspaceAccount
  deleteAccount?: typeof deleteWorkspaceAccount
}

export function AccountSettingsRoute({
  getAccountSettings = getWorkspaceAccountSettings,
  renameAccount = renameWorkspaceAccount,
  deleteAccount = deleteWorkspaceAccount,
}: AccountSettingsRouteProps) {
  const apiClient = useApiClient()

  const [committedName, setCommittedName] = useState<string | undefined>(
    undefined
  )
  const [nameValue, setNameValue] = useState<string | undefined>(undefined)
  const [nameError, setNameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const {
    loading,
    data: summary,
    error,
  } = useFuture(
    () => getAccountSettings(apiClient),
    [apiClient, getAccountSettings]
  )

  useEffect(() => {
    if (summary != null) {
      setNameValue(summary.name)
    }
  }, [summary])

  const currentNameValue = nameValue ?? summary?.name ?? ''
  const serverName = committedName ?? summary?.name
  const hasUnsavedNameChanges =
    summary != null && currentNameValue.trim() !== serverName
  const visibleUsers = summary?.users.slice(0, 3) ?? []
  const visibleProjects = summary?.projects.slice(0, 2) ?? []
  const userOverflowCount =
    summary != null
      ? summary.additionalUserCount + Math.max(0, summary.users.length - 3)
      : 0
  const projectOverflowCount =
    summary != null
      ? summary.additionalProjectCount +
        Math.max(0, summary.projects.length - 2)
      : 0

  const handleSave = useCallback(() => {
    const trimmed = currentNameValue.trim()

    if (trimmed.length === 0) {
      setNameError('Account name is required')
      return
    }

    setNameError(null)
    setSaving(true)

    renameAccount(apiClient, trimmed).pipe(
      fork(() => {
        setNameError(
          'Failed to update the account name. The server may be unavailable; try again.'
        )
        setSaving(false)
      })(() => {
        setSaving(false)
        setCommittedName(trimmed)
      })
    )
  }, [apiClient, currentNameValue, renameAccount, setCommittedName])

  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setNameValue(event.target.value)

      if (nameError != null) {
        setNameError(null)
      }
    },
    [nameError]
  )

  const handleCancelNameChange = useCallback(() => {
    const latestName = committedName ?? summary?.name
    if (latestName != null) {
      setNameValue(latestName)
    }

    setNameError(null)
  }, [committedName, summary])

  const handleOpenDeleteModal = useCallback(() => {
    setDeleteError(null)
    setDeleteModalOpen(true)
  }, [])

  const handleCloseDeleteModal = useCallback(() => {
    if (deleting) {
      return
    }

    setDeleteModalOpen(false)
    setDeleteError(null)
  }, [deleting])

  const handleDeleteAccount = useCallback(() => {
    setDeleteError(null)
    setDeleting(true)

    deleteAccount(apiClient).pipe(
      fork(() => {
        setDeleteError(
          'Failed to delete the account. The server may be unavailable or your session may have expired. Refresh the page, sign back in if needed, and try again.'
        )
        setDeleting(false)
      })(() => {
        setDeleting(false)
        setDeleteModalOpen(false)
        setDeleted(true)
      })
    )
  }, [apiClient, deleteAccount])

  if (loading) {
    return <FullPageLoading />
  }

  if (deleted) {
    return <Navigate replace to="/login" />
  }

  if (error || summary == null) {
    return (
      <PageFrame>
        <PageFrame.Body>
          <Block width="100%" maxWidth={1440} margin="0 auto">
            <Alert type="danger">
              Failed to load account settings. Please refresh the page and try
              again.
            </Alert>
          </Block>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Body>
        <Block width="100%" maxWidth={1440} margin="0 auto">
          <Col gap={spacing.xl} width="100%">
            <Block
              component="header"
              width="100%"
              paddingBottom={spacing.lg}
              borderBottom={`1px solid ${color.border.default}`}
            >
              <Col gap={spacing.sm}>
                <PageFrame.Title>Account</PageFrame.Title>
                <Text variant="bodySmall" color={color.text.secondary}>
                  Manage account settings for this workspace.
                </Text>
                <Text variant="bodySmall" color={color.text.muted}>
                  Current account name: {summary.name}
                </Text>
              </Col>
            </Block>

            <SettingsContent>
              <Col gap={spacing.md}>
                <Col gap={spacing.xs}>
                  <Text variant="heading2">Rename account</Text>
                  <Text variant="bodySmall" color={color.text.muted}>
                    Change the name shown across the workspace.
                  </Text>
                </Col>

                <Card padding={spacing.lg}>
                  <FormField id="account-name" invalid={nameError != null}>
                    <Label>Name</Label>
                    <Row gap={spacing.sm} alignItems="flex-start" width="100%">
                      <Block flex={1} minWidth={0}>
                        <Input
                          value={currentNameValue}
                          onChange={handleNameChange}
                          placeholder="Account name"
                          required
                        />
                        <FormFieldError
                          error={
                            nameError != null
                              ? { message: nameError }
                              : undefined
                          }
                        />
                      </Block>

                      <Button
                        size="medium"
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving || !hasUnsavedNameChanges}
                      >
                        Save changes
                      </Button>
                    </Row>

                    {hasUnsavedNameChanges && !saving && (
                      <Row justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="text"
                          onClick={handleCancelNameChange}
                        >
                          Cancel
                        </Button>
                      </Row>
                    )}
                  </FormField>
                </Card>
              </Col>

              <Col gap={spacing.md}>
                <Col gap={spacing.xs}>
                  <Text variant="heading2">Account details</Text>
                  <Text variant="bodySmall" color={color.text.muted}>
                    Created date, seat count, and project count for this
                    account.
                  </Text>
                </Col>

                <Block width="100%">
                  <Card fullBleed>
                    <Col gap={spacing.lg} padding={spacing.lg}>
                      <Table aria-label="Account details">
                        <Table.Header>
                          <Table.Row>
                            <Table.HeaderCell>Field</Table.HeaderCell>
                            <Table.HeaderCell>Value</Table.HeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          <Table.Row>
                            <Table.Cell>Created</Table.Cell>
                            <Table.Cell>
                              {new Date(summary.createdAt).toLocaleDateString()}
                            </Table.Cell>
                          </Table.Row>
                          <Table.Row>
                            <Table.Cell>Users</Table.Cell>
                            <Table.Cell>
                              <Col gap={spacing.xs}>
                                <Text variant="bodySmall">
                                  {summary.userCount} users
                                </Text>

                                <Link
                                  component={RouterLink}
                                  props={{
                                    to: '/settings/team',
                                    'aria-label': 'View team members',
                                  }}
                                >
                                  <Row
                                    alignItems="center"
                                    gap={spacing.sm}
                                    flexWrap="wrap"
                                  >
                                    <Row alignItems="center">
                                      {visibleUsers.map((user, index) => (
                                        <Block
                                          key={user.id}
                                          width={24}
                                          height={24}
                                          marginLeft={
                                            index === 0 ? 0 : -spacing.xs
                                          }
                                          position="relative"
                                          zIndex={index + 1}
                                          borderRadius={radius.full}
                                          overflow="hidden"
                                        >
                                          <Avatar
                                            mode="image-only"
                                            size={24}
                                            name={user.name}
                                            email={user.email}
                                          />
                                        </Block>
                                      ))}
                                    </Row>

                                    {userOverflowCount > 0 && (
                                      <Text
                                        variant="bodySmall"
                                        color={color.text.muted}
                                      >
                                        and {userOverflowCount} more
                                      </Text>
                                    )}
                                  </Row>
                                </Link>
                              </Col>
                            </Table.Cell>
                          </Table.Row>
                          <Table.Row>
                            <Table.Cell>Projects</Table.Cell>
                            <Table.Cell>
                              <Col gap={spacing.xs}>
                                <Text variant="bodySmall">
                                  {summary.projectCount} projects
                                </Text>

                                <Row
                                  alignItems="center"
                                  gap={spacing.xs}
                                  flexWrap="wrap"
                                >
                                  {visibleProjects.map((project, index) => (
                                    <Row key={project.id} alignItems="center">
                                      {index > 0 && (
                                        <Text
                                          variant="bodySmall"
                                          as="span"
                                          color={color.text.muted}
                                        >
                                          ·
                                        </Text>
                                      )}

                                      <Text variant="bodySmall" as="span">
                                        <Link
                                          component={RouterLink}
                                          props={{
                                            to: `/projects/${project.id}`,
                                          }}
                                        >
                                          {project.name}
                                        </Link>
                                      </Text>
                                    </Row>
                                  ))}

                                  {projectOverflowCount > 0 && (
                                    <Text variant="bodySmall" as="span">
                                      <Link
                                        component={RouterLink}
                                        props={{ to: '/projects' }}
                                      >
                                        and {projectOverflowCount} more projects
                                      </Link>
                                    </Text>
                                  )}
                                </Row>
                              </Col>
                            </Table.Cell>
                          </Table.Row>
                        </Table.Body>
                      </Table>
                    </Col>
                  </Card>
                </Block>
              </Col>

              <Col gap={spacing.md}>
                <Col gap={spacing.xs}>
                  <Text variant="heading2">Danger zone</Text>
                  <Text variant="bodySmall" color={color.text.muted}>
                    Deleting the account disables the workspace for every
                    member.
                  </Text>
                </Col>

                <Card context="danger" padding={0}>
                  <Block padding={spacing.lg}>
                    <ActionRow
                      label="Delete account"
                      description="Delete this account to disable the workspace for all members."
                      control={
                        <Button
                          size="medium"
                          variant="outlined"
                          context="danger"
                          onClick={handleOpenDeleteModal}
                        >
                          Delete account
                        </Button>
                      }
                    />
                  </Block>
                </Card>
              </Col>
            </SettingsContent>
          </Col>
        </Block>
      </PageFrame.Body>

      {deleteModalOpen && (
        <Modal
          width={560}
          height={360}
          aria-label="Delete account"
          onClose={handleCloseDeleteModal}
        >
          <Modal.Header
            title="Delete account?"
            description="Deleting the account disables the workspace for every member."
          />
          <Modal.Body>
            <Col gap={spacing.md}>
              <Text variant="bodySmall" color={color.text.muted}>
                This removes access to the workspace for all members and cannot
                be undone.
              </Text>

              {deleteError && <Alert type="danger">{deleteError}</Alert>}

              <Row gap={spacing.sm} justifyContent="flex-end">
                <Button
                  size="medium"
                  variant="outlined"
                  onClick={handleCloseDeleteModal}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  size="medium"
                  variant="contained"
                  context="danger"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete account'}
                </Button>
              </Row>
            </Col>
          </Modal.Body>
        </Modal>
      )}
    </PageFrame>
  )
}

export function AccountSettingsRouteConnected() {
  const session = useSession()
  const sessionLoading = useSessionLoading()

  if (sessionLoading) {
    return <FullPageLoading />
  }

  if (!(session != null && 'admin' in session && session.admin === true)) {
    return <Navigate replace to="/settings/profile" />
  }

  return <AccountSettingsRoute />
}

export default AccountSettingsRouteConnected
/* eslint-enable */
