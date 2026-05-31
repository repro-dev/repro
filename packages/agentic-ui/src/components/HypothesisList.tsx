import { Block, Col, Row } from "@jsxstyle/react";
import { sortHypothesesByConfidence, type Hypothesis } from "@repro/agentic";
import { color, focusRing, radius, spacing, textStyles } from "@repro/design";
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
                fontSize={11}
                fontWeight={600}
                lineHeight={1}
                paddingH={spacing.xs}
                paddingV={2}
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
          fontSize={11}
          fontWeight={600}
          lineHeight={1}
          paddingH={spacing.xs}
          paddingV={2}
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
            gap={2}
            {...focusRing("neutral")}
            props={{
              type: "button",
              onClick: () => setExpanded(!expanded),
              "aria-label": expanded ? "Collapse evidence" : "Expand evidence",
            }}
          >
            <Block fontSize={11} lineHeight={1}>
              {hypothesis.evidence.length}
            </Block>
            {expanded ? (
              <ChevronDownIcon size={12} />
            ) : (
              <ChevronRightIcon size={12} />
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
            fontSize={13}
            lineHeight={1.4}
            margin={0}
            paddingLeft={spacing.lg}
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
        <Row
          alignItems="center"
          backgroundColor={color.warningSubtle}
          borderRadius={radius.md}
          color={color.warning}
          gap={spacing.xs}
          padding={spacing.sm}
        >
          <AlertTriangleIcon size={14} />
          <Block fontSize={13} lineHeight={1.3}>
            The top hypothesis has low confidence. More evidence may be needed
            to reach a reliable conclusion.
          </Block>
        </Row>
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
