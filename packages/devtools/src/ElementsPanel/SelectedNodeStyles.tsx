import { Block, Inline, Row } from '@jsxstyle/react'
import { colors, spacing } from '@repro/design'
import { useLatestControlFrame } from '@repro/playback'
import React from 'react'
import { useSelectedElement } from '../hooks'

export const SelectedNodeStyles: React.FC = () => {
  const selectedElement = useSelectedElement()
  const latestControlFrame = useLatestControlFrame()

  if (!selectedElement) {
    return (
      <EmptyState
        title="No element selected"
        body="Select an element to see its authored CSS rules."
      />
    )
  }

  if (!latestControlFrame) {
    return (
      <EmptyState
        title="No session"
        body="Start a recording session to inspect styles."
      />
    )
  }

  // Placeholder: stylesheet capture from recording layer is not yet implemented.
  // When stylesheet data is available in the VTree, this component will:
  // 1. Traverse VTree to find stylesheet nodes
  // 2. Parse CSS text via parseCSSRule from @repro/css-utils
  // 3. Compute specificity via computeSpecificity
  // 4. Match rules to selected element
  // 5. Sort by specificity and apply override detection
  return (
    <Block padding={spacing.md}>
      <EmptyState
        title="Styles not yet captured"
        body={
          'Stylesheet rule capture during recording is not yet implemented. ' +
          `Use the Computed view to see computed styles for ${selectedElement.tagName}.`
        }
      />
    </Block>
  )
}

interface EmptyStateProps {
  title: string
  body: string
}

function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <Block padding={spacing.md}>
      <Row alignItems="center" gap={spacing.sm} paddingBottom={spacing.sm}>
        <Inline
          fontFamily="monospace"
          fontSize={11}
          fontWeight={700}
          color={colors.slate['700']}
          textTransform="uppercase"
        >
          {title}
        </Inline>
      </Row>
      <Block fontFamily="monospace" fontSize={11} color={colors.slate['500']}>
        {body}
      </Block>
    </Block>
  )
}
