import { Col, Row } from '@jsxstyle/react'
import { ApiClient, useApiClient } from '@repro/api-client'
import { useSession, useSessionLoading } from '@repro/auth'
import {
  Alert,
  Button,
  Card,
  FullPageLoading,
  Input,
  Label,
  PageFrame,
  Stack,
  Text,
  spacing,
} from '@repro/design'
import { AccountSettingsSummary } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { fork } from 'fluture'
import React, { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

function defaultGetAccountSettings(apiClient: ApiClient) {
  return apiClient.fetch<AccountSettingsSummary>('/account/settings')
}

function defaultRenameAccount(apiClient: ApiClient, name: string) {
  return apiClient.fetch('/account/name', {
    method: 'put',
    body: JSON.stringify({ name }),
    headers: { 'content-type': 'application/json' },
  })
}

interface AccountSettingsRouteProps {
  getAccountSettings?: typeof defaultGetAccountSettings
  renameAccount?: typeof defaultRenameAccount
}

export function AccountSettingsRoute({
  getAccountSettings = defaultGetAccountSettings,
  renameAccount = defaultRenameAccount,
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
        <Stack gap="2xl">
          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Text variant="heading3">Account name</Text>
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

          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Text variant="heading3">Account details</Text>
              <Stack gap="md">
                <Col gap={spacing.xs}>
                  <Text variant="caption">Created</Text>
                  <Text variant="body">
                    {new Date(summary.createdAt).toLocaleDateString()}
                  </Text>
                </Col>

                <Col gap={spacing.xs}>
                  <Text variant="caption">Users</Text>
                  <Text variant="body">{summary.userCount}</Text>
                </Col>

                <Col gap={spacing.xs}>
                  <Text variant="caption">Projects</Text>
                  <Text variant="body">{summary.projectCount}</Text>
                </Col>
              </Stack>
            </Col>
          </Card>

          <Card>
            <Col padding={spacing.xl} gap={spacing.sm}>
              <Text variant="heading3">Danger zone</Text>
              <Text variant="body">
                Account deactivation is not available yet. When support lands,
                controls will appear here.
              </Text>
            </Col>
          </Card>
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
