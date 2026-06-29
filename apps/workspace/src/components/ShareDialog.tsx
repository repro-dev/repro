import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Button,
  Input,
  Modal,
  Select,
  color,
  spacing,
  textStyles,
} from '@repro/design'
import { ShareTokenInfo } from '@repro/domain'
import { createShareToken as defaultCreateShareToken } from '@repro/workspace-api'
import { fork } from 'fluture'
import { CheckIcon } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

export interface ShareDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  recordingId: string
  // Injectable for testing; defaults to real workspace-api function.
  createShareTokenFn?: typeof defaultCreateShareToken
}

const EXPIRY_OPTIONS = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'Never' },
] as const

type ExpiryValue = (typeof EXPIRY_OPTIONS)[number]['value']

function getExpiresAt(expiry: ExpiryValue): string | null {
  if (expiry === 'never') {
    return null
  }

  const now = Date.now()
  const ms =
    expiry === '24h' ? 86400000 : expiry === '7d' ? 604800000 : 2592000000 // 30d

  return new Date(now + ms).toISOString()
}

export const ShareDialog = ({
  open,
  onClose,
  projectId,
  recordingId,
  createShareTokenFn = defaultCreateShareToken,
}: ShareDialogProps) => {
  const apiClient = useApiClient()

  const [shareToken, setShareToken] = useState<ShareTokenInfo | null>(null)
  const [expiry, setExpiry] = useState<ExpiryValue>('7d')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cancel ref holds the fluture Cancel function so we can cancel on unmount.
  const cancelRef = useRef<(() => void) | null>(null)
  const submittingRef = useRef(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setShareToken(null)
      setExpiry('7d')
      setError(null)
      setSubmitting(false)
      setCopied(false)
      submittingRef.current = false
    }
  }, [open])

  // Cancel any in-flight request on unmount
  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current()
      }
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const handleCreate = useCallback(() => {
    if (submittingRef.current) {
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    setCopied(false)

    const expiresAt = getExpiresAt(expiry)

    const future = createShareTokenFn(
      apiClient,
      projectId,
      recordingId,
      expiresAt
    )

    const cancel = fork((_err: Error) => {
      submittingRef.current = false
      setError('Failed to create share link. Please try again.')
      setSubmitting(false)
      cancelRef.current = null
    })((token: ShareTokenInfo) => {
      submittingRef.current = false
      setSubmitting(false)
      setShareToken(token)
      cancelRef.current = null
    })(future)

    cancelRef.current = cancel as unknown as () => void
  }, [expiry, apiClient, projectId, recordingId, createShareTokenFn])

  const handleCopy = useCallback(async () => {
    if (!shareToken) {
      return
    }

    try {
      await navigator.clipboard.writeText(shareToken.shareUrl)
      setCopied(true)

      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current)
      }

      copyTimerRef.current = setTimeout(() => {
        setCopied(false)
        copyTimerRef.current = null
      }, 2000)
    } catch {
      setError('Failed to copy to clipboard.')
    }
  }, [shareToken])

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      aria-label="Share recording"
      width={480}
      height="auto"
    >
      <Col gap={spacing.lg} padding={spacing.xl}>
        <Modal.Header title="Share recording" />

        <Col gap={spacing.sm}>
          <Block {...textStyles.body} color={color.text.default}>
            Anyone with this link can view the recording and use the DevTools to
            debug it — just like a workspace member.
          </Block>
          <Col gap={spacing.xs}>
            <Row gap={spacing.sm} alignItems="baseline">
              <Block {...textStyles.body} color={color.text.secondary}>
                &bull;
              </Block>
              <Block {...textStyles.body} color={color.text.secondary}>
                Recording title, URL, and description
              </Block>
            </Row>
            <Row gap={spacing.sm} alignItems="baseline">
              <Block {...textStyles.body} color={color.text.secondary}>
                &bull;
              </Block>
              <Block {...textStyles.body} color={color.text.secondary}>
                Browser, operating system, and duration
              </Block>
            </Row>
            <Row gap={spacing.sm} alignItems="baseline">
              <Block {...textStyles.body} color={color.text.secondary}>
                &bull;
              </Block>
              <Block {...textStyles.body} color={color.text.secondary}>
                Full playback with DevTools (Elements, Console, Network, and
                other panels)
              </Block>
            </Row>
          </Col>
        </Col>

        {shareToken ? (
          <Col gap={spacing.md}>
            <Input
              aria-label="Share link"
              value={shareToken.shareUrl}
              readOnly
              onClick={(evt: React.MouseEvent<HTMLInputElement>) =>
                (evt.target as HTMLInputElement).select()
              }
            />

            {copied ? (
              <Row
                justifyContent="flex-end"
                gap={spacing.xs}
                alignItems="center"
              >
                <CheckIcon size={14} />
                <Block {...textStyles.body} color={color.success}>
                  Copied!
                </Block>
              </Row>
            ) : null}

            {error ? <Alert type="danger">{error}</Alert> : null}

            <Row justifyContent="flex-end" gap={spacing.md}>
              <Button
                variant="contained"
                context="info"
                size="medium"
                rounded
                onClick={handleCopy}
                type="button"
              >
                Copy link
              </Button>
              <Button
                variant="outlined"
                context="neutral"
                size="medium"
                rounded
                onClick={onClose}
                type="button"
              >
                Close
              </Button>
            </Row>
          </Col>
        ) : (
          <Col gap={spacing.lg}>
            <Col gap={spacing.sm}>
              <Block
                component="label"
                {...textStyles.label}
                color={color.text.secondary}
              >
                Link expiry
              </Block>
              <Select
                value={expiry}
                onChange={val => setExpiry(val as ExpiryValue)}
                options={EXPIRY_OPTIONS.map(opt => ({
                  value: opt.value,
                  label: opt.label,
                }))}
                aria-label="Link expiry"
              />
            </Col>

            {error ? <Alert type="danger">{error}</Alert> : null}

            <Row justifyContent="flex-end" gap={spacing.md}>
              <Button
                variant="outlined"
                context="neutral"
                size="medium"
                rounded
                disabled={submitting}
                onClick={onClose}
                type="button"
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                context="info"
                size="medium"
                rounded
                disabled={submitting}
                onClick={handleCreate}
                type="button"
              >
                Create share link
              </Button>
            </Row>
          </Col>
        )}
      </Col>
    </Modal>
  )
}
