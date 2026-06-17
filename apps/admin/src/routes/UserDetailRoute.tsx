import { Block, Col, Grid } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  FullPageError,
  FullPageLoading,
  PageFrame,
  Table,
  Tabs,
  Text,
  color,
  spacing,
} from '@repro/design'
import { StaffUserDetail, UserProjectMembership } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { DeactivateUserDialog } from './UserDetailRoute/DeactivateUserDialog'

type ActionRowProps = {
  label: string
  description: string
  control: React.ReactNode
}

const ActionRow: React.FC<ActionRowProps> = ({
  label,
  description,
  control,
}) => (
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

const desktopViewportQuery = '(min-width: 1024px)'

const useIsDesktopViewport = () => {
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

const TabPanelContent: React.FC<React.PropsWithChildren> = ({ children }) => {
  const isDesktop = useIsDesktopViewport()

  return (
    <Col
      component="section"
      gap={spacing.md}
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

export const UserDetailRoute: React.FC = () => {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const apiClient = useApiClient()

  const userResult = useFuture(
    () => apiClient.fetch<StaffUserDetail>(`/staff/users/${userId}`),
    [userId]
  )

  const projectsResult = useFuture(
    () =>
      apiClient.fetch<{ items: UserProjectMembership[] }>(
        `/staff/users/${userId}/projects`
      ),
    [userId]
  )

  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const user = userResult.data

  if (user == null) {
    if (userResult.error) {
      return (
        <FullPageError
          title="Failed to load user"
          description={userResult.error.message}
        />
      )
    }

    return <FullPageLoading />
  }

  const handleDeactivate = async () => {
    setDeactivateError(null)
    try {
      await apiClient.wrapP(
        apiClient.fetch(`/staff/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
          headers: { 'Content-Type': 'application/json' },
        })
      )
    } catch (err) {
      setDeactivateError(
        err instanceof Error ? err.message : 'Failed to deactivate user'
      )
      throw err
    }
    // Navigate back to account
    navigate(`/accounts/${user.accountId}`)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatRole = (role: string) => {
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  return (
    <PageFrame>
      <PageFrame.Body>
        <Block width="100%" maxWidth={1440} margin={`${spacing.none} auto`}>
          <Col gap={spacing.xl} width="100%">
            <Block
              component="header"
              width="100%"
              paddingBottom={spacing.lg}
              borderBottom={`1px solid ${color.border.default}`}
            >
              <Col gap={spacing.sm}>
                <Breadcrumbs ariaLabel="User breadcrumb">
                  <Breadcrumbs.Item
                    component={RouterLink}
                    props={{ to: `/accounts/${user.accountId}` }}
                  >
                    Accounts
                  </Breadcrumbs.Item>
                  <Breadcrumbs.Item current>{user.name}</Breadcrumbs.Item>
                </Breadcrumbs>

                <Col gap={spacing.xs}>
                  <PageFrame.Title>{user.name}</PageFrame.Title>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    {user.email}
                  </Text>
                </Col>
              </Col>
            </Block>

            <Tabs defaultValue="overview">
              <Tabs.List aria-label="User detail sections">
                <Tabs.Tab value="overview">Overview</Tabs.Tab>
                <Tabs.Tab value="memberships">Project memberships</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="overview">
                <TabPanelContent>
                  <Col gap={spacing.xs}>
                    <Text variant="heading2">Overview</Text>
                    <Text variant="bodySmall" color={color.text.muted}>
                      Account details and verification status.
                    </Text>
                  </Col>

                  <Block width="100%">
                    <Card fullBleed>
                      <Table aria-label="Overview">
                        <Table.Header>
                          <Table.Row>
                            <Table.HeaderCell>Field</Table.HeaderCell>
                            <Table.HeaderCell>Value</Table.HeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          <Table.Row>
                            <Table.Cell>Account status</Table.Cell>
                            <Table.Cell>
                              {user.active ? 'Active' : 'Deactivated'}
                            </Table.Cell>
                          </Table.Row>
                          <Table.Row>
                            <Table.Cell>Verification</Table.Cell>
                            <Table.Cell>
                              {user.verified ? 'Verified' : 'Not verified'}
                            </Table.Cell>
                          </Table.Row>
                          <Table.Row>
                            <Table.Cell>Created</Table.Cell>
                            <Table.Cell>
                              {formatDate(user.createdAt)}
                            </Table.Cell>
                          </Table.Row>
                        </Table.Body>
                      </Table>
                    </Card>
                  </Block>

                  {!user.active && (
                    <Alert type="warning">
                      This user has been deactivated.
                    </Alert>
                  )}

                  {user.active && (
                    <Block width="100%" marginTop={spacing['3xl']}>
                      <Col component="section" gap={spacing.md} width="100%">
                        <Col gap={spacing.xs}>
                          <Text variant="heading2">Danger zone</Text>
                          <Text variant="bodySmall" color={color.text.muted}>
                            These actions are destructive and may remove access
                            from this account.
                          </Text>
                        </Col>

                        <Card context="danger" padding={spacing.none}>
                          <Col gap={spacing.none}>
                            {[
                              {
                                label: 'Deactivate user',
                                description:
                                  'Remove this user from active access.',
                                control: (
                                  <Button
                                    variant="outlined"
                                    context="danger"
                                    onClick={() =>
                                      setShowDeactivateDialog(true)
                                    }
                                  >
                                    Deactivate user
                                  </Button>
                                ),
                              },
                            ].map((action, index) => (
                              <Block
                                key={action.label}
                                paddingTop={spacing.lg}
                                paddingBottom={spacing.lg}
                                paddingLeft={spacing.xl}
                                paddingRight={spacing.xl}
                                borderTop={
                                  index === 0
                                    ? 'none'
                                    : `1px solid ${color.border.default}`
                                }
                              >
                                <ActionRow {...action} />
                              </Block>
                            ))}
                          </Col>
                        </Card>
                      </Col>
                    </Block>
                  )}
                </TabPanelContent>
              </Tabs.Panel>

              <Tabs.Panel value="memberships">
                <TabPanelContent>
                  <Col gap={spacing.xs}>
                    <Text variant="heading2">
                      Project memberships (
                      {projectsResult.data?.items.length ?? 0})
                    </Text>
                    <Text variant="bodySmall" color={color.text.muted}>
                      Assigned projects and roles for this account.
                    </Text>
                  </Col>

                  <Block width="100%">
                    <Card fullBleed>
                      {projectsResult.loading ? (
                        <Text variant="bodySmall" color={color.text.secondary}>
                          Loading...
                        </Text>
                      ) : projectsResult.error ? (
                        <Alert type="danger">
                          Failed to load project memberships:{' '}
                          {projectsResult.error.message}
                        </Alert>
                      ) : projectsResult.data?.items.length === 0 ? (
                        <Text variant="bodySmall" color={color.text.secondary}>
                          No project memberships.
                        </Text>
                      ) : (
                        <Table aria-label="Project memberships">
                          <Table.Header>
                            <Table.Row>
                              <Table.HeaderCell>Project</Table.HeaderCell>
                              <Table.HeaderCell>Role</Table.HeaderCell>
                            </Table.Row>
                          </Table.Header>
                          <Table.Body>
                            {projectsResult.data?.items.map(
                              (membership: UserProjectMembership) => (
                                <Table.Row key={membership.project.id}>
                                  <Table.Cell>
                                    {membership.project.name}
                                  </Table.Cell>
                                  <Table.Cell>
                                    {formatRole(membership.role)}
                                  </Table.Cell>
                                </Table.Row>
                              )
                            )}
                          </Table.Body>
                        </Table>
                      )}
                    </Card>
                  </Block>
                </TabPanelContent>
              </Tabs.Panel>
            </Tabs>
          </Col>
        </Block>
      </PageFrame.Body>
      {showDeactivateDialog && (
        <DeactivateUserDialog
          userName={user.name}
          onConfirm={handleDeactivate}
          onClose={() => setShowDeactivateDialog(false)}
          confirmError={deactivateError}
          onConfirmError={setDeactivateError}
        />
      )}
    </PageFrame>
  )
}
