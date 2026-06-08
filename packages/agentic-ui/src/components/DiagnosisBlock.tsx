import { Block, Col, Row } from '@jsxstyle/react'
import {
  sortHypothesesByConfidence,
  type Audience,
  type DiagnosisContent,
  type Hypothesis,
  type NextAction,
} from '@repro/agentic'
import {
  Badge,
  Card,
  Collapsible,
  color,
  focusRing,
  radius,
  spacing,
  Table,
  Text,
  transition,
} from '@repro/design'
import {
  ArrowRightIcon,
  BugIcon,
  Code2Icon,
  FileTextIcon,
  SearchIcon,
} from 'lucide-react'
import React from 'react'
import { HypothesisList } from './HypothesisList'
import { ResponseFeedback } from './ResponseFeedback'

type ConfidenceLevel = 'high' | 'medium' | 'low'

const contextMap: Record<ConfidenceLevel, 'danger' | 'warning' | 'neutral'> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

const ConfidenceBadge: React.FC<{ level: ConfidenceLevel }> = ({ level }) => {
  return (
    <Badge size="small" context={contextMap[level]}>
      {level}
    </Badge>
  )
}

const EvidenceTable: React.FC<{ evidence: Array<string> }> = ({ evidence }) => (
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
    hoverColor={color.text.default}
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
  id: NextAction['action']
}

const EXTENSION_ACTIONS: BuiltInAction[] = [
  {
    icon: <FileTextIcon size={14} />,
    label: 'File issue',
    id: 'file-issue',
  },
  {
    icon: <ArrowRightIcon size={14} />,
    label: 'Continue investigating',
    id: 'continue-investigating',
  },
]

const WORKSPACE_ACTIONS: BuiltInAction[] = [
  {
    icon: <FileTextIcon size={14} />,
    label: 'File issue',
    id: 'file-issue',
  },
  {
    icon: <Code2Icon size={14} />,
    label: 'Prepare dev context',
    id: 'prepare-context',
  },
  {
    icon: <SearchIcon size={14} />,
    label: 'Inspect user journey',
    id: 'inspect-journey',
  },
  {
    icon: <ArrowRightIcon size={14} />,
    label: 'Continue investigating',
    id: 'continue-investigating',
  },
]

const actionIconMap: Record<NextAction['action'], React.ReactNode> = {
  'file-issue': <FileTextIcon size={14} />,
  'prepare-context': <Code2Icon size={14} />,
  'inspect-journey': <SearchIcon size={14} />,
  'check-network': <BugIcon size={14} />,
  'continue-investigating': <ArrowRightIcon size={14} />,
}

interface DiagnosisBlockProps {
  diagnosisContent: DiagnosisContent
  topHypothesis: Hypothesis | null
  allHypotheses: Hypothesis[]
  audience: Audience
  onAction: (action: NextAction['action']) => void
  onFeedback?: (sentiment: 'positive' | 'negative') => void
}

export const DiagnosisBlock: React.FC<DiagnosisBlockProps> = ({
  diagnosisContent,
  topHypothesis,
  allHypotheses,
  audience,
  onAction,
  onFeedback,
}) => {
  const sortedHypotheses = sortHypothesesByConfidence(allHypotheses)
  const hasSecondaryHypotheses = allHypotheses.length > 1

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
      id: `recommendation-${i}` as NextAction['action'],
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

          {/* Section divider */}
          <Block
            borderBlockEnd={`1px solid ${color.border.default}`}
            paddingBlockEnd={0}
            marginBlockEnd={0}
          />

          {/* 2. Evidence items — open by default for top hypothesis */}
          {topHypothesis !== null && topHypothesis.evidence.length > 0 && (
            <Collapsible
              trigger={
                <Text variant="label" weight="semibold">
                  Evidence
                </Text>
              }
              defaultOpen={true}
            >
              <EvidenceTable evidence={topHypothesis.evidence} />
            </Collapsible>
          )}

          {/* 3. Inference — collapsed by default */}
          {diagnosisContent.inference.length > 0 && (
            <Collapsible
              trigger={
                <Text variant="label" weight="semibold">
                  How we got here
                </Text>
              }
              defaultOpen={false}
            >
              <Text variant="caption" color={color.text.secondary}>
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
              <HypothesisList hypotheses={sortedHypotheses.slice(1)} />
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
                icon={actionIconMap[action.id] ?? <ArrowRightIcon size={14} />}
                label={action.label}
                onClick={() => onAction(action.id)}
              />
            ))}
          </Row>

          {/* 6. Feedback */}
          {onFeedback !== undefined && (
            <ResponseFeedback onFeedback={onFeedback} />
          )}
        </Col>
      </Card>
    </Block>
  )
}
