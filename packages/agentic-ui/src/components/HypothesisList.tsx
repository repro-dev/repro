import { Block, Col, Row } from "@jsxstyle/react";
import { sortHypothesesByConfidence, type Hypothesis } from "@repro/agentic";
import {
  Alert,
  color,
  focusRing,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  spacing,
  textStyles,
} from "@repro/design";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import React, { useState } from "react";

// Confidence color mapping: each level gets a semantic border/background tint
const CONFIDENCE_COLORS: Record<
  "low" | "medium" | "high",
  { bg: string; text: string; label: string }
> = {
  high: {
    bg: color.successSubtle,
    text: color.success,
    label: "High",
  },
  medium: {
    bg: color.warningSubtle,
    text: color.warning,
    label: "Medium",
  },
  low: {
    bg: color.dangerSubtle,
    text: color.danger,
    label: "Low",
  },
};

interface HypothesisCardProps {
  hypothesis: Hypothesis;
  isTop: boolean;
  defaultExpanded: boolean;
}

const HypothesisCard: React.FC<HypothesisCardProps> = ({
  hypothesis,
  isTop,
  defaultExpanded,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const confColor = CONFIDENCE_COLORS[hypothesis.confidence];
  const hasEvidence = hypothesis.evidence.length > 0;

  return (
    <Block
      backgroundColor={color.bg.surface}
      border={`1px solid ${color.border.default}`}
      borderRadius={radius.md}
      overflow="hidden"
    >
      <Row
        alignItems="center"
        gap={spacing.sm}
        paddingH={spacing.md}
        paddingV={spacing.sm}
      >
        <Block flexGrow={1}>
          <Row alignItems="center" gap={spacing.sm}>
            <Block component="span" {...textStyles.body}>
              {hypothesis.description}
            </Block>
            {isTop && (
              <Block
                backgroundColor={color.primary}
                borderRadius={radius.sm}
                color={color.text.inverse}
                fontSize={fontSize.xs}
                fontWeight={fontWeight.semibold}
                lineHeight={lineHeight.tight}
                paddingH={spacing.xs}
                paddingV={spacing.xs}
              >
                Top
              </Block>
            )}
          </Row>
        </Block>

        <Block
          backgroundColor={confColor.bg}
          borderRadius={radius.sm}
          color={confColor.text}
          fontSize={fontSize.xs}
          fontWeight={fontWeight.semibold}
          lineHeight={lineHeight.tight}
          paddingH={spacing.xs}
          paddingV={spacing.xs}
        >
          {confColor.label}
        </Block>

        {hasEvidence && (
          <Row
            alignItems="center"
            color={color.text.muted}
            component="button"
            cursor="pointer"
            flexShrink={0}
            gap={spacing.xs}
            padding={spacing.xs}
            {...focusRing("neutral")}
            props={{
              type: "button",
              onClick: () => setExpanded(!expanded),
              "aria-label": expanded
                ? "Collapse evidence"
                : `Expand ${hypothesis.evidence.length} pieces of evidence`,
            }}
          >
            <Block fontSize={fontSize.xs} lineHeight={lineHeight.tight}>
              {hypothesis.evidence.length} evidence
            </Block>
            {expanded ? (
              <ChevronDownIcon size={16} />
            ) : (
              <ChevronRightIcon size={16} />
            )}
          </Row>
        )}
      </Row>

      {expanded && hasEvidence && (
        <Block
          borderTop={`1px solid ${color.border.default}`}
          padding={spacing.md}
        >
          <Block
            color={color.text.secondary}
            component="ul"
            margin={0}
            paddingLeft={spacing.lg}
            {...textStyles.bodySmall}
          >
            {hypothesis.evidence.map((piece, i) => (
              <Block component="li" key={i} marginBottom={spacing.xs}>
                {piece}
              </Block>
            ))}
          </Block>
        </Block>
      )}
    </Block>
  );
};

interface HypothesisListProps {
  hypotheses: Array<Hypothesis>;
}

export const HypothesisList: React.FC<HypothesisListProps> = ({
  hypotheses,
}) => {
  const sorted = sortHypothesesByConfidence(hypotheses);
  const topHypothesis = sorted[0];
  const isLowConfidenceTop =
    topHypothesis !== undefined && topHypothesis.confidence === "low";

  if (sorted.length === 0) {
    return null;
  }

  return (
    <Col gap={spacing.sm} marginTop={spacing.md}>
      <Block {...textStyles.label} color={color.text.secondary}>
        Investigation hypotheses
      </Block>

      {isLowConfidenceTop && (
        <Alert type="warning" icon={<AlertTriangleIcon size={14} />}>
          The top hypothesis has low confidence. More evidence may be needed to
          reach a reliable conclusion.
        </Alert>
      )}

      {sorted.map((hypothesis, index) => (
        <HypothesisCard
          key={hypothesis.id}
          hypothesis={hypothesis}
          isTop={index === 0}
          defaultExpanded={index === 0}
        />
      ))}
    </Col>
  );
};
