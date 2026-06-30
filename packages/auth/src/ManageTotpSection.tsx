import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Button,
  Card,
  Input,
  LoadingState,
  Text,
  color,
  radius,
  spacing,
} from '@repro/design'
import { fork } from 'fluture'
import {
  AlertCircleIcon,
  InfoIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { TotpSetupFlow } from './TotpSetupFlow'

interface TotpStatus {
  enabled: boolean
  backupCodesRemaining: number
}

export const ManageTotpSection: React.FC = () => {
  const apiClient = useApiClient()
  const [status, setStatus] = useState<TotpStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [showDisableForm, setShowDisableForm] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disableError, setDisableError] = useState<string | null>(null)
  const [regenerateSuccess, setRegenerateSuccess] =
    useState<Array<string> | null>(null)
  const [copied, setCopied] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const fetchStatus = useCallback(() => {
    setLoading(true)
    apiClient.fetch<TotpStatus>('/account/totp/status').pipe(
      fork(() => {
        setError(
          'Failed to load TOTP status. Your session may have expired or the server may be unavailable. Refresh the page or sign in again.'
        )
        setLoading(false)
      })((result: TotpStatus) => {
        setStatus(result)
        setLoading(false)
      })
    )
  }, [apiClient])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  function handleSetupComplete() {
    setShowSetup(false)
    fetchStatus()
  }

  function handleDisable() {
    if (disablePassword.length === 0 || disableCode.length !== 6) return

    setDisableError(null)

    apiClient
      .fetch('/account/totp/disable', {
        method: 'POST',
        body: JSON.stringify({
          password: disablePassword,
          code: disableCode,
        }),
      })
      .pipe(
        fork(() => {
          setDisableError(
            'Failed to disable two-factor authentication. Check your password and code and try again.'
          )
        })(() => {
          setShowDisableForm(false)
          setDisablePassword('')
          setDisableCode('')
          fetchStatus()
        })
      )
  }

  function handleRegenerate() {
    apiClient
      .fetch<{ items: Array<string> }>(
        '/account/totp/regenerate-backup-codes',
        {
          method: 'POST',
        }
      )
      .pipe(
        fork(() => {
          setError(
            'Failed to regenerate backup codes. Your session may have expired or the server may be unavailable. Refresh the page or sign in again.'
          )
        })((result: { items: Array<string> }) => {
          setRegenerateSuccess(result.items)
          setShowRegenerateConfirm(false)
          fetchStatus()
        })
      )
  }

  if (showSetup) {
    return (
      <TotpSetupFlow
        onComplete={handleSetupComplete}
        onCancel={() => setShowSetup(false)}
      />
    )
  }

  if (loading) {
    return (
      <Col gap={spacing.md}>
        <Block height={120}>
          <LoadingState />
        </Block>
      </Col>
    )
  }

  const enabled = status?.enabled ?? false
  const backupCodesRemaining = status?.backupCodesRemaining ?? 0

  return (
    <Col gap={spacing.md}>
      <Col gap={spacing.xs}>
        <Text variant="heading2">Two-factor authentication</Text>
        <Text variant="bodySmall" color={color.text.muted}>
          Add an extra layer of security to your account.
        </Text>
      </Col>

      {error && (
        <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
          {error}
        </Alert>
      )}

      {regenerateSuccess && (
        <Card padding={spacing.lg}>
          <Col gap={spacing.md}>
            <Alert type="info" icon={<InfoIcon size={16} />}>
              New backup codes generated. Save them in a safe place — old codes
              are no longer valid.
            </Alert>
            <Block
              backgroundColor={color.bg.subtle}
              padding={spacing.md}
              borderRadius={radius.md}
            >
              {regenerateSuccess.map((code, i) => (
                <Text key={i} variant="code" color={color.text.default}>
                  {code}
                </Text>
              ))}
            </Block>
            <Row gap={spacing.sm}>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  navigator.clipboard.writeText(regenerateSuccess.join('\n'))
                  setCopied(true)
                  setTimeout(() => {
                    if (mountedRef.current) setCopied(false)
                  }, 2000)
                }}
              >
                {copied ? 'Copied!' : 'Copy codes'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setRegenerateSuccess(null)}
              >
                Dismiss
              </Button>
            </Row>
          </Col>
        </Card>
      )}

      <Card padding={spacing.lg}>
        {!enabled ? (
          <Col gap={spacing.md}>
            <Row gap={spacing.sm} alignItems="center">
              <ShieldOffIcon size={20} color={color.text.muted} />
              <Text variant="body" color={color.text.secondary}>
                Two-factor authentication is not enabled.
              </Text>
            </Row>
            <Button
              variant="contained"
              onClick={() => {
                setShowSetup(true)
                setError(null)
              }}
            >
              Set up two-factor authentication
            </Button>
          </Col>
        ) : (
          <Col gap={spacing.md}>
            <Row gap={spacing.sm} alignItems="center">
              <ShieldCheckIcon size={20} color={color.success} />
              <Text variant="body" color={color.text.default}>
                Two-factor authentication is enabled.
              </Text>
            </Row>

            <Text variant="bodySmall" color={color.text.muted}>
              {backupCodesRemaining} backup code
              {backupCodesRemaining !== 1 ? 's' : ''} remaining.
            </Text>

            <Row gap={spacing.sm}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setShowRegenerateConfirm(true)}
                disabled={showRegenerateConfirm}
              >
                Regenerate backup codes
              </Button>
              <Button
                size="small"
                variant="outlined"
                context="danger"
                onClick={() => setShowDisableForm(true)}
                disabled={showDisableForm}
              >
                Disable two-factor authentication
              </Button>
            </Row>

            {showRegenerateConfirm && (
              <Col gap={spacing.sm}>
                <Text variant="bodySmall" color={color.text.muted}>
                  This will invalidate all existing backup codes and generate
                  new ones.
                </Text>
                <Row gap={spacing.sm}>
                  <Button
                    size="small"
                    variant="contained"
                    context="danger"
                    onClick={handleRegenerate}
                  >
                    Yes, regenerate
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setShowRegenerateConfirm(false)}
                  >
                    Cancel
                  </Button>
                </Row>
              </Col>
            )}

            {showDisableForm && (
              <Col gap={spacing.sm}>
                <Text variant="bodySmall" color={color.text.muted}>
                  Enter your password and a current TOTP code to disable
                  two-factor authentication.
                </Text>

                <Input
                  type="password"
                  value={disablePassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDisablePassword(e.target.value)
                  }
                  placeholder="Password"
                />
                <Input
                  value={disableCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDisableCode(
                      e.target.value.replace(/\D/g, '').slice(0, 6)
                    )
                  }
                  placeholder="Authentication code"
                />

                {disableError && (
                  <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
                    {disableError}
                  </Alert>
                )}

                <Row gap={spacing.sm}>
                  <Button
                    size="small"
                    variant="contained"
                    context="danger"
                    onClick={handleDisable}
                    disabled={
                      disablePassword.length === 0 || disableCode.length !== 6
                    }
                  >
                    Disable
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      setShowDisableForm(false)
                      setDisableError(null)
                    }}
                  >
                    Cancel
                  </Button>
                </Row>
              </Col>
            )}
          </Col>
        )}
      </Card>
    </Col>
  )
}
