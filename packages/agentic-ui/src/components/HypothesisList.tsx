import { Block, Col, Row } from "@jsxstyle/react";
import { sortHypothesesByConfidence, type Hypothesis } from "@repro/agentic";
import {
  Alert,
  Collapsible,
  color,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  spacing,
  textStyles,
} from "@repro/design";
import { AlertTriangleIcon } from "lucide-react";
import React from "react";

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

const ConfidenceBadge: React.FC<{ level: keyof typeof CONFIDENCE_COLORS }> = ({
  level,
}) => {
  const { bg, text, label } = CONFIDENCE_COLORS[level];

  return (
    <Block
      backgroundColor={bg}
      borderRadius={radius.sm}
      color={text}
      fontSize={fontSize.xs}
      fontWeight={fontWeight.semibold}
      lineHeight={lineHeight.tight}
      paddingH={spacing.xs}
      paddingV={spacing.xs}
    >
      {label}
    </Block>
  );
};

const EvidenceList: React.FC<{ evidence: Array<string> }> = ({ evidence }) => (
  <Block component="ul" margin={0} paddingLeft={spacing.lg}>
    {evidence.map((piece, i) => (
      <Block component="li" key={i} marginBottom={spacing.xs}>
        {piece}
      </Block>
    ))}
  </Block>
);

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
  const hasEvidence = hypothesis.evidence.length > 0;

  const header = (
    <Col gap={spacing.xs} flex={1}>
      <Row alignItems="center" gap={spacing.sm}>
        <Block component="span" {...textStyles.body} flexGrow={1}>
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
        <ConfidenceBadge level={hypothesis.confidence} />
      </Row>
      {hasEvidence && (
        <Block color={color.text.muted} {...textStyles.bodySmall}>
          {hypothesis.evidence.length}{" "}
          {hypothesis.evidence.length === 1 ? "evidence" : "evidence"}
        </Block>
      )}
    </Col>
  );

  if (hasEvidence) {
    return (
      <Collapsible trigger={header} defaultOpen={defaultExpanded}>
        <EvidenceList evidence={hypothesis.evidence} />
      </Collapsible>
    );
  }

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
        {header}
      </Row>
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
