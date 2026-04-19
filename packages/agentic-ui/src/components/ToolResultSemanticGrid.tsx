import { Grid } from "@jsxstyle/react";
import React from "react";

import { ToolResultRow } from "./ToolResultRow";
import { TOOL_RESULT_ROW_STYLES } from "./toolResultRowStyles";

interface ToolResultSemanticGridProps {
  timeMs: number;
  kind: "console" | "network";
  children: React.ReactNode;
  onGoToTime?: (timeMs: number) => void;
  showGoToTime?: boolean;
  gridTemplateColumns: string;
}

export const ToolResultSemanticGrid: React.FC<ToolResultSemanticGridProps> = ({
  timeMs,
  kind,
  children,
  onGoToTime,
  showGoToTime = true,
  gridTemplateColumns,
}) => (
  <ToolResultRow
    timeMs={timeMs}
    alignItems="flex-start"
    kind={kind}
    onGoToTime={onGoToTime}
    showGoToTime={showGoToTime}
  >
    <Grid
      minWidth={0}
      width="100%"
      flexGrow={1}
      rowGap={TOOL_RESULT_ROW_STYLES.lineGap}
      gridTemplateColumns={gridTemplateColumns}
      columnGap={TOOL_RESULT_ROW_STYLES.gap}
    >
      {children}
    </Grid>
  </ToolResultRow>
);
