import { Block, Row } from "@jsxstyle/react";
import { color, spacing, textStyles } from "@repro/design";
import React from "react";

export const TruncationSeparator: React.FC = () => (
  <Row
    alignItems="center"
    gap={spacing.md}
    paddingBlock={spacing.sm}
    props={{ role: "status", "aria-live": "polite" }}
  >
    <Block flexGrow={1} height={1} backgroundColor={color.border.default} />
    <Block {...textStyles.caption} color={color.text.muted} whiteSpace="nowrap">
      Earlier messages were removed to fit the context window
    </Block>
    <Block flexGrow={1} height={1} backgroundColor={color.border.default} />
  </Row>
);
