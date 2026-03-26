import { Col, Row } from "@jsxstyle/react";
import {
  Button,
  color,
  fontSize,
  fontWeight,
  radius,
  spacing,
} from "@repro/design";
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
}) => {
  return (
    <Col
      backgroundColor={color.dangerSubtle}
      borderColor={color.dangerBorderSubtle}
      borderRadius={radius.md}
      borderStyle="solid"
      borderWidth={1}
      gap={spacing.md}
      padding={spacing.lg}
    >
      <Row alignItems="center" gap={spacing.md}>
        <AlertCircleIcon color={color.danger} size={16} />
        <Row
          color={color.dangerFg}
          fontSize={fontSize.xs}
          fontWeight={fontWeight.semibold}
        >
          {error.message}
        </Row>
      </Row>

      {error.retryable && (
        <Row>
          <Button
            context="danger"
            size="small"
            variant="outlined"
            onClick={onRetry}
          >
            Retry
          </Button>
        </Row>
      )}
    </Col>
  );
};
