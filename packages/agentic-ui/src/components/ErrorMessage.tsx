import { Block, Row } from "@jsxstyle/react";
import { Button, Text, color, radius, spacing } from "@repro/design";
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
    <Row
      alignItems="center"
      backgroundColor={color.dangerTint}
      borderColor={color.dangerBorderSubtle}
      borderRadius={radius.md}
      borderStyle="solid"
      borderWidth={1}
      gap={spacing.md}
      padding={spacing.lg}
    >
      <Block flexShrink={0}>
        <AlertCircleIcon color={color.danger} size={16} />
      </Block>
      <Block flexGrow={1}>
        <Text variant="caption" color={color.dangerFg} as="span">
          {error.message}
        </Text>
      </Block>
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
  );
};
