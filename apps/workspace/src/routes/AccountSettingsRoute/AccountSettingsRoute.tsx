import { Block, Col, Grid } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession, useSessionLoading } from '@repro/auth'
import {
  Alert,
  Button,
  Card,
  FullPageLoading,
  Input,
  Label,
  PageFrame,
  Table,
  Text,
  color,
  spacing,
} from '@repro/design'
import { useFuture } from '@repro/future-utils'
import {
  getAccountSettings as getWorkspaceAccountSettings,
  renameAccount as renameWorkspaceAccount,
} from '@repro/workspace-api'
import { fork } from 'fluture'
import React, { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

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
const accountRetirementSupportUrl =
  'mailto:support@repro.dev?subject=Account%20retirement%20request'

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
}

export function AccountSettingsRoute({
  getAccountSettings = getWorkspaceAccountSettings,
  renameAccount = renameWorkspaceAccount,
}: AccountSettingsRouteProps) {
  const apiClient = useApiClient()

  const [refreshKey, setRefreshKey] = useState(0)
  const [nameValue, setNameValue] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    loading,
    data: summary,
    error,
  } = useFuture(
    () => getAccountSettings(apiClient),
    [apiClient, getAccountSettings, refreshKey]
  )

  useEffect(() => {
    if (summary != null) {
      setNameValue(summary.name)
    }
  }, [summary])

  const handleSave = useCallback(() => {
    const trimmed = nameValue.trim()

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
        setRefreshKey(key => key + 1)
      })
    )
  }, [apiClient, nameValue, renameAccount])

  const handleContactSupport = useCallback(() => {
    window.location.href = accountRetirementSupportUrl
  }, [])

  if (loading) {
    return <FullPageLoading />
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
                  <Col gap={spacing.md}>
                    <Col gap={spacing.sm}>
                      <Label htmlFor="account-name">Name</Label>
                      <Input
                        id="account-name"
                        value={nameValue}
                        onChange={event => setNameValue(event.target.value)}
                        placeholder="Account name"
                      />
                    </Col>

                    {nameError && <Alert type="danger">{nameError}</Alert>}

                    <Block>
                      <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        Save changes
                      </Button>
                    </Block>
                  </Col>
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
                          <Table.Cell>{summary.userCount}</Table.Cell>
                        </Table.Row>
                        <Table.Row>
                          <Table.Cell>Projects</Table.Cell>
                          <Table.Cell>{summary.projectCount}</Table.Cell>
                        </Table.Row>
                      </Table.Body>
                    </Table>
                  </Card>
                </Block>
              </Col>

              <Col gap={spacing.md}>
                <Col gap={spacing.xs}>
                  <Text variant="heading2">Danger zone</Text>
                  <Text variant="bodySmall" color={color.text.muted}>
                    Account retiring is handled by support.
                  </Text>
                </Col>

                <Card context="danger" padding={0}>
                  <Block padding={spacing.lg}>
                    <ActionRow
                      label="Retire account"
                      description="Need help retiring this account? Contact support for the supported path."
                      control={
                        <Button
                          variant="outlined"
                          context="danger"
                          onClick={handleContactSupport}
                        >
                          Contact support
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
