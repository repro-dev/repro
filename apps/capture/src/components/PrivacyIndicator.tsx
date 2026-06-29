import { Block, Row } from '@jsxstyle/react'
import { color, fontWeight, spacing, textStyles } from '@repro/design'
import { RedactionOverride } from '@repro/recording'
import React from 'react'

interface PrivacyIndicatorProps {
  override: RedactionOverride
}

function getPresetLabel(override: RedactionOverride): string {
  if (override.maskImages) return 'Strict'
  if (override.maskedSelectors.length === 0) return 'Off'
  return 'Standard'
}

function getMaskingSummary(override: RedactionOverride): string {
  if (override.maskImages) {
    return 'Masks inputs, images, and .repro-mask elements'
  }
  if (override.maskedSelectors.length === 0) {
    return 'Minimal filtering — auth headers only'
  }
  return 'Respects .repro-mask and .repro-ignore classes'
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
  const label = getPresetLabel(override)
  const summary = getMaskingSummary(override)

  return (
    <Block
      position="fixed"
      bottom={68}
      left={20}
      zIndex={2147483646}
      pointerEvents="none"
    >
      <Row
        backgroundColor={color.bg.surface}
        borderRadius={6}
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
