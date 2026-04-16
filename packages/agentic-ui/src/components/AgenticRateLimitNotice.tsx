import { Block, Row } from "@jsxstyle/react";
import { Alert } from "@repro/design";
import { ClockIcon } from "lucide-react";
import React from "react";

interface AgenticRateLimitNoticeProps {
  // Epoch ms at which the rate limit resets.
  retryAfter: number;
}

function formatResetTime(epochMs: number): string {
  const date = new Date(epochMs);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Rate limit notice shown instead of the normal input area. No retry button —
// user must wait until the window resets.
export const AgenticRateLimitNotice: React.FC<AgenticRateLimitNoticeProps> = ({
  retryAfter,
}) => (
  <Alert type="warning" icon={<ClockIcon size={16} />}>
    <Row alignItems="center">
      <Block flexGrow={1}>
        {`You've reached the limit for this session. You can continue at ${formatResetTime(
          retryAfter,
        )}.`}
      </Block>
    </Row>
  </Alert>
);
