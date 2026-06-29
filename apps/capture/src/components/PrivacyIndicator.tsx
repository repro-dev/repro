import { Block, Row } from '@jsxstyle/react'
import { color, fontWeight, radius, spacing, textStyles } from '@repro/design'
import { RedactionOverride } from '@repro/recording'
import React from 'react'
import { MAX_INT32 } from '~/constants'
import { describePreset } from '~/recordingPrivacyCopy'

interface PrivacyIndicatorProps {
  override: RedactionOverride
}

/**
 * Compact active-preset indicator for the capture widget.
 *
 * Informational and minimal — reuses @repro/design components and jsxstyle
 * layout primitives. Shows the active privacy preset name and a one-line
 * masking summary.
 */
export const PrivacyIndicator: React.FC<PrivacyIndicatorProps> = ({
  override,
}) => {
  const { label, summary } = describePreset(override)

  return (
    <Block
      position="fixed"
      // Deliberate pixel anchor — no clean spacing-token mapping exists for
      // this fixed-position corner placement relative to the capture chrome.
      bottom={68}
      left={20}
      zIndex={MAX_INT32 - 1}
      pointerEvents="none"
      props={{ role: 'status' }}
    >
      <Row
        backgroundColor={color.bg.surface}
        borderRadius={radius.md}
        paddingH={spacing.sm}
        paddingV={spacing.xs}
        gap={spacing.xs}
        alignItems="center"
      >
        <Block
          {...textStyles.caption}
          color={color.text.secondary}
          fontWeight={fontWeight.semibold}
        >
          {label}
        </Block>
        <Block {...textStyles.caption} color={color.text.muted}>
          {summary}
        </Block>
      </Row>
    </Block>
  )
}
