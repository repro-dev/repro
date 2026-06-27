import { Col, Row } from '@jsxstyle/react'
import { ApiClient, useApiClient } from '@repro/api-client'
import {
  Alert,
  Badge,
  Button,
  Card,
  PageFrame,
  Skeleton,
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
  return apiClient.fetch<UserProfile>('/account/me/profile')
}

function defaultUpdateName(apiClient: ApiClient, name: string) {
  return apiClient.fetch('/account/me/name', {
    method: 'put',
    body: JSON.stringify({ name }),
  })
}

function defaultSendVerification(apiClient: ApiClient) {
  return apiClient.fetch('/account/me/send-verification', { method: 'post' })
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

  const [committedProfile, setCommittedProfile] = useState<UserProfile | null>(
    null
  )

  const {
    loading,
    data: profile,
    error,
  } = useFuture(() => getProfile(apiClient), [apiClient, getProfile])

  const effectiveProfile = committedProfile ?? profile

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
    setNameValue(effectiveProfile?.name ?? '')
    setNameError(null)
    setIsEditingName(true)
  }, [effectiveProfile])

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
        setCommittedProfile({ ...profile!, name: trimmed })
      })
    )
  }, [apiClient, nameValue, profile, updateName])

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
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Profile</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Stack gap={spacing.lg}>
            <Card>
              <Col padding={spacing.xl} gap={spacing.lg}>
                <Skeleton variant="text" width="30%" height={24} />
                <Skeleton variant="text" width="60%" />
              </Col>
            </Card>
            <Card>
              <Col padding={spacing.xl} gap={spacing.lg}>
                <Skeleton variant="text" width="30%" height={24} />
                <Skeleton variant="text" width="60%" />
              </Col>
            </Card>
            <Card>
              <Col padding={spacing.xl} gap={spacing.lg}>
                <Skeleton variant="text" width="30%" height={24} />
                <Skeleton variant="text" width="60%" />
              </Col>
            </Card>
            <Card>
              <Col padding={spacing.xl} gap={spacing.lg}>
                <Skeleton variant="text" width="30%" height={24} />
                <Skeleton variant="text" width="60%" />
              </Col>
            </Card>
          </Stack>
        </PageFrame.Body>
      </PageFrame>
    )
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

  const displayProfile = effectiveProfile!

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Profile</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body maxWidth={720}>
        <Card>
          <Col padding={spacing.xl} gap={spacing['3xl']}>
            <Col gap={spacing.lg}>
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
                <Text variant="body">{displayProfile.name}</Text>
              )}
            </Col>

            <Col gap={spacing.lg}>
              <Text variant="heading3">Email</Text>
              <Row alignItems="center" gap={spacing.md}>
                <Text variant="body">{displayProfile.email}</Text>
                <Badge
                  context={displayProfile.verified ? 'success' : 'warning'}
                >
                  {displayProfile.verified ? 'Verified' : 'Unverified'}
                </Badge>
              </Row>
              {!displayProfile.verified && (
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

            <Col gap={spacing.lg}>
              <Text variant="heading3">Account</Text>
              <Text variant="body">{displayProfile.account.name}</Text>
            </Col>

            <Col gap={spacing.lg}>
              <Text variant="heading3">Member since</Text>
              <Text variant="body">
                {new Date(displayProfile.createdAt).toLocaleDateString()}
              </Text>
            </Col>
          </Col>
        </Card>
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
