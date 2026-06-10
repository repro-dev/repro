import { Block, Row } from '@jsxstyle/react'
import { buildCodingAgentExport, type RecordingMeta } from '@repro/agentic'
import { useAtomValue } from '@repro/atom'
import { Button, fontSize, spacing, Tooltip } from '@repro/design'
import { CheckIcon, CopyIcon, LoaderIcon } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAgenticState } from '../context'

interface CopyForCodingAgentButtonProps {
  recordingMeta: RecordingMeta | null
}

export const CopyForCodingAgentButton: React.FC<
  CopyForCodingAgentButtonProps
> = ({ recordingMeta }) => {
  const agentic = useAgenticState()
  const entries = useAtomValue(agentic.$entries)
  const hypotheses = useAtomValue(agentic.$hypotheses)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const hasAssistant = entries.some(e => e.role === 'assistant')
  const isBusy = loading || copied

  const handleCopy = useCallback(async () => {
    setLoading(true)

    try {
      const markdown = await buildCodingAgentExport(
        entries,
        hypotheses,
        recordingMeta
      )
      await navigator.clipboard.writeText(markdown)
      setLoading(false)
      setCopied(true)

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }

      timerRef.current = setTimeout(() => {
        setCopied(false)
        timerRef.current = null
      }, 2000)
    } catch {
      setLoading(false)
    }
  }, [entries, hypotheses, recordingMeta])

  if (!hasAssistant) {
    return null
  }

  const label = loading ? 'Copying...' : copied ? 'Copied!' : undefined

  const icon = loading ? (
    <LoaderIcon size={14} />
  ) : copied ? (
    <CheckIcon size={14} />
  ) : (
    <CopyIcon size={14} />
  )

  return (
    <Button
      variant="text"
      size="small"
      disabled={isBusy}
      onClick={handleCopy}
      aria-label={
        loading
          ? 'Copying to clipboard'
          : copied
          ? 'Copied to clipboard'
          : 'Copy for coding agent'
      }
      aria-live="polite"
    >
      <Row gap={spacing.xs} alignItems="center">
        {icon}
        {label && (
          <Block component="span" fontSize={fontSize.xs}>
            {label}
          </Block>
        )}
      </Row>
      <Tooltip>Copy for coding agent</Tooltip>
    </Button>
  )
}
