import { Block, Row } from "@jsxstyle/react";
import { color, fontFamily, fontSize, radius, spacing } from "@repro/design";
import {
  getInvestigationReadiness,
  Hypothesis,
  InvestigationStage,
} from "@repro/agentic";
import React from "react";

interface InvestigationStageIndicatorProps {
  stage: InvestigationStage;
  hypotheses: Array<Hypothesis>;
}

export const InvestigationStageIndicator: React.FC<
  InvestigationStageIndicatorProps
> = ({ stage, hypotheses }) => {
  const readiness = getInvestigationReadiness(hypotheses);

  return (
    <Block
      aria-live="polite"
      borderColor={color.border.default}
      borderRadius={radius.md}
      borderStyle="solid"
      borderWidth={1}
      backgroundColor={color.bg.surface}
      marginBlockEnd={spacing.sm}
      paddingBlock={spacing.sm}
      paddingInline={spacing.md}
    >
      <Row gap={spacing.sm} alignItems="center" flexWrap="wrap">
        <Block
          color={color.text.muted}
          fontFamily={fontFamily.sans}
          fontSize={fontSize.xs}
        >
          Stage
        </Block>

        <Block
          color={color.text.default}
          fontFamily={fontFamily.sans}
          fontSize={fontSize.xs}
        >
          {stage}
        </Block>

        <Block
          color={color.text.muted}
          fontFamily={fontFamily.sans}
          fontSize={fontSize.xs}
        >
          •
        </Block>

        <Block
          color={
            readiness === "ready to conclude"
              ? color.text.default
              : color.text.muted
          }
          fontFamily={fontFamily.sans}
          fontSize={fontSize.xs}
        >
          {readiness}
        </Block>
      </Row>
    </Block>
  );
};
