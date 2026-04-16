import { Block, Row } from "@jsxstyle/react";
import { AgenticError } from "@repro/agentic";
import { Alert, Button } from "@repro/design";
import { AlertCircleIcon } from "lucide-react";
import React from "react";

interface AgenticMessageErrorProps {
  error: AgenticError;
  onRetry?: () => void;
}

// Inline message-level error shown in the conversation thread for terminal
// failures (kind: terminal_tool_failure, malformed_response). No stack traces
// or tool names — user-friendly copy only.
export const AgenticMessageError: React.FC<AgenticMessageErrorProps> = ({
  error,
  onRetry,
}) => (
  <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
    <Row alignItems="center" gap={0}>
      <Block flexGrow={1}>{error.message}</Block>
      {error.retryable && onRetry != null && (
        <Button
          context="danger"
          size="small"
          variant="outlined"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </Row>
  </Alert>
);
