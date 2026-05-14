import { Col, Grid, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession, useSessionLoading } from '@repro/auth'
import {
  Alert,
  Button,
  Card,
  DefinitionList,
  FullPageLoading,
  Input,
  Label,
  PageFrame,
  Stack,
  Text,
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

  if (loading) {
    return <FullPageLoading />
  }

  if (error || summary == null) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Account</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Alert type="danger">
            Failed to load account settings. Please refresh the page and try
            again.
          </Alert>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Account</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body maxWidth={720}>
        <Stack gap="xl">
          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Col gap={spacing.xs}>
                <Text variant="heading3">Account name</Text>
                <Text variant="body">
                  Change the name shown across the workspace.
                </Text>
              </Col>

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

              <Row gap={spacing.md}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                >
                  Save changes
                </Button>
              </Row>
            </Col>
          </Card>

          <Grid gridTemplateColumns="minmax(0, 160px) minmax(0, 1fr)">
            <DefinitionList
              title="Account details"
              pairs={[
                ['Created', new Date(summary.createdAt).toLocaleDateString()],
                ['Users', summary.userCount],
                ['Projects', summary.projectCount],
              ]}
            />
          </Grid>

          <Col gap={spacing.sm}>
            <Text variant="heading3">Danger zone</Text>
            <Alert type="danger">
              Account retiring and deactivation help is handled by support.
              Contact support if you need help retiring this account.
            </Alert>
          </Col>
        </Stack>
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
