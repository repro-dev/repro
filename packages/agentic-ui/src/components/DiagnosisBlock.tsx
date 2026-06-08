import { Block, Col, Row } from '@jsxstyle/react'
import {
  type Audience,
  type DiagnosisContent,
  type Hypothesis,
} from '@repro/agentic'
import {
  Alert,
  Card,
  Collapsible,
  color,
  focusRing,
  radius,
  spacing,
  Text,
  transition,
} from '@repro/design'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  Code2Icon,
  FileTextIcon,
  SearchIcon,
} from 'lucide-react'
import React from 'react'
import { ConfidenceBadge } from './ConfidenceBadge'
import { EvidenceList } from './EvidenceList'
import { HypothesisList } from './HypothesisList'

const ACTION_ICON_SIZE = 14

interface ActionChipProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
}

const ActionChip: React.FC<ActionChipProps> = ({ icon, label, onClick }) => (
  <Row
    alignItems="center"
    backgroundColor={color.bg.hover}
    border={`1px solid ${color.border.default}`}
    borderRadius={radius.sm}
    color={color.text.default}
    component="button"
    cursor="pointer"
    gap={spacing.xs}
    paddingH={spacing.md}
    paddingV={spacing.sm}
    hoverBackgroundColor={color.bg.muted}
    transition={transition.fast}
    {...focusRing('neutral')}
    props={{ type: 'button', onClick, 'aria-label': label }}
  >
    {icon}
    <Text variant="caption" weight="semibold">
      {label}
    </Text>
  </Row>
)

interface BuiltInAction {
  icon: React.ReactNode
  label: string
  id: string
}

const EXTENSION_ACTIONS: BuiltInAction[] = [
  {
    icon: <FileTextIcon size={ACTION_ICON_SIZE} />,
    label: 'File issue',
    id: 'file-issue',
  },
  {
    icon: <ArrowRightIcon size={ACTION_ICON_SIZE} />,
    label: 'Continue investigating',
    id: 'continue-investigating',
  },
]

const WORKSPACE_ACTIONS: BuiltInAction[] = [
  {
    icon: <FileTextIcon size={ACTION_ICON_SIZE} />,
    label: 'File issue',
    id: 'file-issue',
  },
  {
    icon: <Code2Icon size={ACTION_ICON_SIZE} />,
    label: 'Prepare dev context',
    id: 'prepare-context',
  },
  {
    icon: <SearchIcon size={ACTION_ICON_SIZE} />,
    label: 'Inspect user journey',
    id: 'inspect-journey',
  },
  {
    icon: <ArrowRightIcon size={ACTION_ICON_SIZE} />,
    label: 'Continue investigating',
    id: 'continue-investigating',
  },
]

interface DiagnosisBlockProps {
  diagnosisContent: DiagnosisContent
  topHypothesis: Hypothesis | null
  allHypotheses: Hypothesis[]
  audience: Audience
  onAction: (action: string) => void
}

export const DiagnosisBlock: React.FC<DiagnosisBlockProps> = ({
  diagnosisContent,
  topHypothesis,
  allHypotheses,
  audience,
  onAction,
}) => {
  const hasSecondaryHypotheses = allHypotheses.length > 1
  const hasEvidence =
    topHypothesis !== null && topHypothesis.evidence.length > 0
  const hasInference = diagnosisContent.inference.length > 0
  const hasContentBelow = hasEvidence || hasInference || hasSecondaryHypotheses

  const builtInActions =
    audience === 'extension' ? EXTENSION_ACTIONS : WORKSPACE_ACTIONS

  const recommendationActions = diagnosisContent.recommendations
    .filter(
      rec =>
        !builtInActions.some(a =>
          rec.toLowerCase().includes(a.id.replace(/-/g, ' '))
        )
    )
    .map((rec, i) => ({
      id: `recommendation-${i}`,
      label: rec,
    }))

  return (
    <Block marginTop={spacing.md}>
      <Card padding={spacing.lg}>
        <Col gap={spacing.md}>
          {/* 1. Diagnosis statement + confidence badge */}
          <Row alignItems="flex-start" gap={spacing.sm}>
            <Block flex={1}>
              <Text variant="body" weight="semibold">
                {diagnosisContent.diagnosis}
              </Text>
            </Block>
            {topHypothesis !== null && (
              <Block flexShrink={0}>
                <ConfidenceBadge level={topHypothesis.confidence} />
              </Block>
            )}
          </Row>

          {/* Low-confidence warning */}
          {topHypothesis?.confidence === 'low' && (
            <Alert
              type="warning"
              icon={<AlertTriangleIcon size={ACTION_ICON_SIZE} />}
            >
              The top hypothesis has low confidence. More evidence may be needed
              to reach a reliable conclusion.
            </Alert>
          )}

          {/* Section divider — only when there is content below */}
          {hasContentBelow && (
            <Block
              borderBlockEnd={`1px solid ${color.border.default}`}
              paddingBlockEnd={0}
              marginBlockEnd={0}
            />
          )}

          {/* 2. Evidence items — open by default for top hypothesis */}
          {hasEvidence && (
            <Collapsible
              trigger={
                <Text variant="label" weight="semibold">
                  Evidence
                </Text>
              }
              defaultOpen={true}
            >
              <EvidenceList evidence={topHypothesis.evidence} />
            </Collapsible>
          )}

          {/* 3. Inference — collapsed by default */}
          {hasInference && (
            <Collapsible
              trigger={
                <Text variant="label" weight="semibold">
                  How we got here
                </Text>
              }
              defaultOpen={false}
            >
              <Text variant="bodySmall" color={color.text.secondary}>
                {diagnosisContent.inference}
              </Text>
            </Collapsible>
          )}

          {/* 4. Secondary hypotheses */}
          {hasSecondaryHypotheses && (
            <Collapsible
              trigger={
                <Text variant="label" weight="semibold">
                  {allHypotheses.length - 1} other{' '}
                  {allHypotheses.length - 1 === 1 ? 'hypothesis' : 'hypotheses'}
                </Text>
              }
              defaultOpen={false}
            >
              <HypothesisList hypotheses={allHypotheses.slice(1)} />
            </Collapsible>
          )}

          {/* 5. Next actions */}
          <Row gap={spacing.sm} flexWrap="wrap" marginBlockStart={spacing.sm}>
            {builtInActions.map(action => (
              <ActionChip
                key={action.id}
                icon={action.icon}
                label={action.label}
                onClick={() => onAction(action.id)}
              />
            ))}
            {recommendationActions.map(action => (
              <ActionChip
                key={action.id}
                icon={<ArrowRightIcon size={ACTION_ICON_SIZE} />}
                label={action.label}
                onClick={() => onAction(action.id)}
              />
            ))}
          </Row>
        </Col>
      </Card>
    </Block>
  )
}
