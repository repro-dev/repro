import { Col, Row } from '@jsxstyle/react'
import { ApiClient, useApiClient } from '@repro/api-client'
import {
  Alert,
  Badge,
  Button,
  Card,
  FullPageLoading,
  PageFrame,
  Stack,
  Text,
  TextField,
  spacing,
} from '@repro/design'
import { UserProfile } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { fork } from 'fluture'
import React, { useCallback, useState } from 'react'

// --- Default API functions (injectable for testing) ---

function defaultGetProfile(apiClient: ApiClient) {
  return apiClient.fetch<UserProfile>('/me/profile')
}

function defaultUpdateName(apiClient: ApiClient, name: string) {
  return apiClient.fetch('/me/name', {
    method: 'put',
    body: JSON.stringify({ name }),
  })
}

function defaultSendVerification(apiClient: ApiClient) {
  return apiClient.fetch('/me/send-verification', { method: 'post' })
}

// --- Props ---

interface ProfileSettingsRouteProps {
  getProfile?: typeof defaultGetProfile
  updateName?: typeof defaultUpdateName
  sendVerification?: typeof defaultSendVerification
}

// --- Pure, testable component ---

export function ProfileSettingsRoute({
  getProfile = defaultGetProfile,
  updateName = defaultUpdateName,
  sendVerification = defaultSendVerification,
}: ProfileSettingsRouteProps) {
  const apiClient = useApiClient()

  const [refreshKey, setRefreshKey] = useState(0)

  const {
    loading,
    data: profile,
    error,
  } = useFuture(
    () => getProfile(apiClient),
    [apiClient, getProfile, refreshKey]
  )

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [updateLoading, setUpdateLoading] = useState(false)

  const [verificationLoading, setVerificationLoading] = useState(false)
  const [verificationError, setVerificationError] = useState<string | null>(
    null
  )
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(
    null
  )

  const handleEdit = useCallback(() => {
    setNameValue(profile?.name ?? '')
    setNameError(null)
    setIsEditingName(true)
  }, [profile])

  const handleCancel = useCallback(() => {
    setIsEditingName(false)
    setNameError(null)
  }, [])

  const handleSave = useCallback(() => {
    const trimmed = nameValue.trim()
    if (trimmed.length === 0) {
      setNameError('Name is required')
      return
    }

    setNameError(null)
    setUpdateLoading(true)

    updateName(apiClient, trimmed).pipe(
      fork(() => {
        setNameError('Failed to update name. Please try again.')
        setUpdateLoading(false)
      })(() => {
        setIsEditingName(false)
        setUpdateLoading(false)
        setRefreshKey(k => k + 1)
      })
    )
  }, [apiClient, nameValue, updateName])

  const handleSendVerification = useCallback(() => {
    setVerificationError(null)
    setVerificationSuccess(null)
    setVerificationLoading(true)

    sendVerification(apiClient).pipe(
      fork(() => {
        setVerificationError(
          'Failed to send verification email. Please try again.'
        )
        setVerificationLoading(false)
      })(() => {
        setVerificationSuccess('Verification email sent.')
        setVerificationLoading(false)
      })
    )
  }, [apiClient, sendVerification])

  if (loading) {
    return <FullPageLoading />
  }

  if (error || !profile) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Profile</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Alert type="danger">
            Failed to load profile. Please try refreshing the page.
          </Alert>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Profile</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body maxWidth={720}>
        <Stack gap="lg">
          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Row alignItems="center" gap={spacing.md}>
                <Text variant="heading3">Name</Text>
                {!isEditingName && (
                  <Button variant="outlined" size="small" onClick={handleEdit}>
                    Edit
                  </Button>
                )}
              </Row>

              {isEditingName ? (
                <Col gap={spacing.md}>
                  <TextField
                    label="Name"
                    id="profile-name"
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    placeholder="Your name"
                    invalid={!!nameError}
                    error={nameError ? { message: nameError } : undefined}
                  />
                  <Row gap={spacing.md}>
                    <Button
                      variant="contained"
                      onClick={handleSave}
                      disabled={updateLoading}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={handleCancel}
                      disabled={updateLoading}
                    >
                      Cancel
                    </Button>
                  </Row>
                </Col>
              ) : (
                <Text variant="body">{profile.name}</Text>
              )}
            </Col>
          </Card>

          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Text variant="heading3">Email</Text>
              <Row alignItems="center" gap={spacing.md}>
                <Text variant="body">{profile.email}</Text>
                <Badge context={profile.verified ? 'success' : 'warning'}>
                  {profile.verified ? 'Verified' : 'Unverified'}
                </Badge>
              </Row>
              {!profile.verified && (
                <Col gap={spacing.md}>
                  {verificationError && (
                    <Alert type="danger">{verificationError}</Alert>
                  )}
                  {verificationSuccess && (
                    <Alert type="success">{verificationSuccess}</Alert>
                  )}
                  <Button
                    variant="outlined"
                    onClick={handleSendVerification}
                    disabled={verificationLoading}
                  >
                    Resend verification
                  </Button>
                </Col>
              )}
            </Col>
          </Card>

          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Text variant="heading3">Account</Text>
              <Text variant="body">{profile.account.name}</Text>
            </Col>
          </Card>

          <Card>
            <Col padding={spacing.xl} gap={spacing.lg}>
              <Text variant="heading3">Member since</Text>
              <Text variant="body">
                {new Date(profile.createdAt).toLocaleDateString()}
              </Text>
            </Col>
          </Card>
        </Stack>
      </PageFrame.Body>
    </PageFrame>
  )
}

/**
 * Connected wrapper — sources apiClient from context.
 */
export function ProfileSettingsRouteConnected() {
  return <ProfileSettingsRoute />
}
