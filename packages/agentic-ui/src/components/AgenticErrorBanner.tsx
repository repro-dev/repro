import { Block, Row } from "@jsxstyle/react";
import { Alert, Button } from "@repro/design";
import { WifiOffIcon } from "lucide-react";
import React from "react";

interface AgenticErrorBannerProps {
  onDismiss?: () => void;
}

// Full-width service-unavailable banner rendered above the input area.
// Input disabled state is controlled by the parent (AgenticView).
// Auto-retry is also managed by the parent — this component is purely presentational.
export const AgenticErrorBanner: React.FC<AgenticErrorBannerProps> = ({
  onDismiss,
}) => (
  <Alert type="danger" icon={<WifiOffIcon size={16} />}>
    <Row alignItems="center" gap={0}>
      <Block flexGrow={1}>Agentic debugging is temporarily unavailable.</Block>
      {onDismiss != null && (
        <Button
          context="danger"
          size="small"
          variant="outlined"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      )}
    </Row>
  </Alert>
);
