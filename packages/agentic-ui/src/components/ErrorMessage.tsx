import { Block, Row } from '@jsxstyle/react'
import { AgenticError } from '@repro/agentic'
import { Alert, Button, spacing } from '@repro/design'
import { AlertCircleIcon } from 'lucide-react'
import React from 'react'

interface ErrorMessageProps {
  error: AgenticError
  onRetry: () => void
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  onRetry,
}) => (
  <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
    <Row alignItems="center" gap={spacing.none}>
      <Block flexGrow={1}>{error.message}</Block>
      {error.retryable && (
        <Button
          context="danger"
          size="small"
          variant="outlined"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </Row>
  </Alert>
)
