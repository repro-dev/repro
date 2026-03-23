import { Col, Row } from '@jsxstyle/react'
import { Button, colors } from '@repro/design'
import { AgenticError } from '@repro/agentic'
import { AlertCircleIcon } from 'lucide-react'
import React from 'react'

interface ErrorMessageProps {
  error: AgenticError
  onRetry: () => void
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ error, onRetry }) => {
  return (
    <Col
      backgroundColor={colors.red['50']}
      borderColor={colors.red['200']}
      borderRadius={8}
      borderStyle="solid"
      borderWidth={1}
      gap={8}
      padding={12}
    >
      <Row alignItems="center" gap={8}>
        <AlertCircleIcon color={colors.red['600']} size={16} />
        <Row
          color={colors.red['800']}
          fontSize={12}
          fontWeight={500}
        >
          {error.message}
        </Row>
      </Row>

      {error.retryable && (
        <Row>
          <Button context="danger" size="small" variant="outlined" onClick={onRetry}>
            Retry
          </Button>
        </Row>
      )}
    </Col>
  )
}
