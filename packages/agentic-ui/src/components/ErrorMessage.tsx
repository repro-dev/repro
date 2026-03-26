import { Block, Row } from "@jsxstyle/react";
import { Alert, Button } from "@repro/design";
import { AgenticError } from "@repro/agentic";
import { AlertCircleIcon } from "lucide-react";
import React from "react";

interface ErrorMessageProps {
  error: AgenticError;
  onRetry: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  onRetry,
}) => (
  <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
    <Row alignItems="center" gap={0}>
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
);
