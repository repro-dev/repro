import { Col, Row } from '@jsxstyle/react'
import { sortHypothesesByConfidence, type Hypothesis } from '@repro/agentic'
import {
  Alert,
  Badge,
  BadgeProps,
  Collapsible,
  color,
  spacing,
  Table,
  Text,
} from '@repro/design'
import { AlertTriangleIcon } from 'lucide-react'
import React from 'react'

type ConfidenceLevel = 'high' | 'medium' | 'low'

const contextMap: Record<ConfidenceLevel, BadgeProps['context']> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

const ConfidenceBadge: React.FC<{ level: 'high' | 'medium' | 'low' }> = ({
  level,
}) => {
  return (
    <Badge size="small" context={contextMap[level]}>
      {level}
    </Badge>
  )
}

const EvidenceList: React.FC<{ evidence: Array<string> }> = ({ evidence }) => (
  <Table density="compact">
    {evidence.map((piece, i) => (
      <Table.Row key={i}>
        <Table.Cell>
          <Text variant="caption" weight="semibold">
            {i + 1}.
          </Text>
        </Table.Cell>
        <Table.Cell>
          <Text variant="caption">{piece}</Text>
        </Table.Cell>
      </Table.Row>
    ))}
  </Table>
)

interface HypothesisCardProps {
  hypothesis: Hypothesis
  defaultExpanded: boolean
}

const HypothesisCard: React.FC<HypothesisCardProps> = ({
  hypothesis,
  defaultExpanded,
}) => {
  const hasEvidence = hypothesis.evidence.length > 0

  const header = (
    <Col gap={spacing.xs} flex={1}>
      <Text variant="bodySmall">{hypothesis.description}</Text>
      {hasEvidence && (
        <Row alignItems="center" gap={spacing.md}>
          <Text variant="caption" weight="semibold">
            Confidence: <ConfidenceBadge level={hypothesis.confidence} />
          </Text>

          <Text variant="caption">&rarr;</Text>

          <Text variant="caption" color={color.text.muted}>
            {hypothesis.evidence.length}{' '}
            {hypothesis.evidence.length === 1 ? 'reason' : 'reasons'}
          </Text>
        </Row>
      )}
    </Col>
  )

  return (
    <Collapsible trigger={header} defaultOpen={defaultExpanded}>
      <EvidenceList evidence={hypothesis.evidence} />
    </Collapsible>
  )
}

interface HypothesisListProps {
  hypotheses: Array<Hypothesis>
}

export const HypothesisList: React.FC<HypothesisListProps> = ({
  hypotheses,
}) => {
  const sorted = sortHypothesesByConfidence(hypotheses)
  const topHypothesis = sorted[0]
  const isLowConfidenceTop =
    topHypothesis !== undefined && topHypothesis.confidence === 'low'

  if (sorted.length === 0) {
    return null
  }

  return (
    <Col gap={spacing.sm} marginTop={spacing.md}>
      <Text variant="heading3">Investigation hypotheses</Text>

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
          defaultExpanded={index === 0}
        />
      ))}
    </Col>
  )
}
