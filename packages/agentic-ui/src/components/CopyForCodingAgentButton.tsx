import { Block, Row } from '@jsxstyle/react'
import { buildCodingAgentExport, type RecordingMeta } from '@repro/agentic'
import { useAtomValue } from '@repro/atom'
import { Button, fontSize, spacing, Tooltip } from '@repro/design'
import { CheckIcon, CopyIcon } from 'lucide-react'
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timer on unmount to prevent dangling timeout
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const hasAssistant = entries.some(e => e.role === 'assistant')

  const handleCopy = useCallback(async () => {
    const markdown = buildCodingAgentExport(entries, hypotheses, recordingMeta)

    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)

      // Clear any existing timer
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }

      timerRef.current = setTimeout(() => {
        setCopied(false)
        timerRef.current = null
      }, 2000)
    } catch {
      // Clipboard API failed — silently ignore (button stays in default state)
    }
  }, [entries, hypotheses, recordingMeta])

  if (!hasAssistant) {
    return null
  }

  return (
    <Row position="absolute" top={spacing.sm} right={spacing.xl} zIndex={1}>
      <Tooltip>Copy for coding agent</Tooltip>
      <Button
        variant="text"
        size="small"
        onClick={handleCopy}
        aria-label={copied ? 'Copied to clipboard' : 'Copy for coding agent'}
        aria-live="polite"
      >
        <Row gap={spacing.xs} alignItems="center">
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          <Block component="span" fontSize={fontSize.xs}>
            {copied ? 'Copied!' : 'Copy for coding agent'}
          </Block>
        </Row>
      </Button>
    </Row>
  )
}
