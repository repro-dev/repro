import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  LoadingState,
  Text,
  color,
  fontFamily,
  fontSize,
  radius,
  spacing,
} from '@repro/design'
import { fork } from 'fluture'
import { AlertCircleIcon, CheckCircleIcon } from 'lucide-react'
import React, { useEffect, useState } from 'react'

interface TotpSetupResult {
  secret: string
  otpauthUri: string
  qrDataUrl: string
}

interface TotpConfirmResult {
  items: Array<string>
}

interface Props {
  onComplete(): void
  onCancel(): void
  accountLabel?: string
}

export const TotpSetupFlow: React.FC<Props> = ({
  onComplete,
  onCancel,
  accountLabel = '',
}) => {
  const apiClient = useApiClient()
  const [step, setStep] = useState<'loading' | 'confirm' | 'done'>('loading')
  const [setupResult, setSetupResult] = useState<TotpSetupResult | null>(null)
  const [confirmResult, setConfirmResult] = useState<TotpConfirmResult | null>(
    null
  )
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    apiClient
      .fetch<TotpSetupResult>('/account/totp/setup', {
        method: 'POST',
        body: JSON.stringify({ accountLabel }),
      })
      .pipe(
        fork(() => {
          setError('Failed to set up TOTP. Please try again.')
        })((result: TotpSetupResult) => {
          setSetupResult(result)
          setStep('confirm')
        })
      )
  }, [apiClient, accountLabel])

  function handleConfirm() {
    if (setupResult == null || code.length !== 6) return

    setError(null)

    apiClient
      .fetch<TotpConfirmResult>('/account/totp/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      .pipe(
        fork(() => {
          setError('Invalid code. Please try again.')
        })((result: TotpConfirmResult) => {
          setConfirmResult(result)
          setStep('done')
        })
      )
  }

  if (step === 'loading') {
    return (
      <Block height={160}>
        <LoadingState />
      </Block>
    )
  }

  if (step === 'done' && confirmResult != null) {
    return (
      <Col gap={spacing.lg}>
        <Col gap={spacing.sm}>
          <Row gap={spacing.sm} alignItems="center">
            <CheckCircleIcon size={20} color={color.success} />
            <Text variant="heading2">Two-factor authentication enabled</Text>
          </Row>
          <Text variant="bodySmall" color={color.text.muted}>
            Save these backup codes in a safe place. You can use each code once
            if you lose access to your authenticator app.
          </Text>
        </Col>

        <Card padding={spacing.lg}>
          <Col gap={spacing.md}>
            <Row
              gap={spacing.md}
              alignItems="center"
              justifyContent="spaceBetween"
            >
              <Label>Backup codes</Label>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  navigator.clipboard.writeText(confirmResult.items.join('\n'))
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? 'Copied!' : 'Copy codes'}
              </Button>
            </Row>
            <Block
              backgroundColor={color.bg.subtle}
              padding={spacing.md}
              borderRadius={radius.md}
            >
              <Col gap={spacing.xs}>
                {confirmResult.items.map((code, i) => (
                  <Block
                    key={i}
                    fontFamily={fontFamily.mono}
                    fontSize={fontSize.md}
                    color={color.text.default}
                  >
                    {code}
                  </Block>
                ))}
              </Col>
            </Block>
          </Col>
        </Card>

        <Button size="large" variant="contained" onClick={onComplete}>
          Done
        </Button>
      </Col>
    )
  }

  if (setupResult == null) {
    return null
  }

  return (
    <Col gap={spacing.lg}>
      <Col gap={spacing.sm}>
        <Text variant="heading2">Set up authenticator app</Text>
        <Text variant="bodySmall" color={color.text.muted}>
          Scan the QR code with your authenticator app (Google Authenticator,
          1Password, Authy, etc.) to get started.
        </Text>
      </Col>

      {setupResult.qrDataUrl && (
        <Block alignSelf="center">
          <img
            src={setupResult.qrDataUrl}
            alt="TOTP QR code"
            width={180}
            height={180}
          />
        </Block>
      )}

      <Col gap={spacing.xs}>
        <Label>Or enter this key manually</Label>
        <Block
          fontFamily={fontFamily.mono}
          fontSize={fontSize.md}
          color={color.text.secondary}
        >
          {setupResult.secret}
        </Block>
      </Col>

      <Col gap={spacing.xs}>
        <Label>Authentication code</Label>
        <Input
          value={code}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
          }
          placeholder="000000"
        />
      </Col>

      {error && (
        <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
          {error}
        </Alert>
      )}

      <Row gap={spacing.sm} justifyContent="flex-end">
        <Button variant="outlined" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={code.length !== 6}
        >
          Verify & enable
        </Button>
      </Row>
    </Col>
  )
}
