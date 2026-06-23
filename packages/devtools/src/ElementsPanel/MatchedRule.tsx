import { Block, InlineBlock, Row } from '@jsxstyle/react'
import {
  color,
  fontSize,
  fontWeight,
  lineHeight,
  spacing,
  Tooltip,
} from '@repro/design'
import React from 'react'

import type { MatchedRuleEntry } from '../hooks'

interface MatchedRuleProps {
  entry: MatchedRuleEntry
}

export const MatchedRule: React.FC<MatchedRuleProps> = ({ entry }) => {
  const {
    selectorText,
    declarations,
    priorities,
    overriddenDeclarations,
    mediaCondition,
    supportsCondition,
    source,
  } = entry

  const propNames = Object.keys(declarations)

  return (
    <Block paddingBottom={spacing.md}>
      {/* @media / @supports condition line */}
      {mediaCondition && (
        <Block
          fontSize={fontSize.xs}
          color={color.text.muted}
          lineHeight={lineHeight.relaxed}
        >
          @media {mediaCondition}
        </Block>
      )}
      {supportsCondition && (
        <Block
          fontSize={fontSize.xs}
          color={color.text.muted}
          lineHeight={lineHeight.relaxed}
        >
          @supports ({supportsCondition})
        </Block>
      )}

      {/* Header row: selector text on left, source on right.
          The selector truncates with ellipsis when long; a Tooltip reveals
          the full selector on hover. Inline (element.style) is always short,
          so no tooltip is rendered for it. */}
      <Row alignItems="center" justifyContent="space-between">
        <Block
          position="relative"
          flex={1}
          minWidth={0}
          overflow="hidden"
          whiteSpace="nowrap"
          textOverflow="ellipsis"
          fontFamily="monospace"
          fontSize={fontSize.xs}
          fontWeight={fontWeight.semibold}
          color={color.text.default}
          lineHeight={lineHeight.relaxed}
        >
          {selectorText || 'element.style'}
          {selectorText && <Tooltip position="top">{selectorText}</Tooltip>}
        </Block>
        <Block
          flexShrink={0}
          marginLeft={spacing.sm}
          fontSize={fontSize.xs}
          color={color.text.muted}
          lineHeight={lineHeight.relaxed}
        >
          {source}
        </Block>
      </Row>

      {/* Declarations */}
      <Block>
        {propNames.map(prop => {
          const value = declarations[prop]!
          const isImportant = priorities[prop] === 'important'
          const isOverridden = overriddenDeclarations.has(prop)

          return (
            <Block
              key={prop}
              fontFamily="monospace"
              fontSize={fontSize.xs}
              lineHeight={lineHeight.relaxed}
              textDecoration={isOverridden ? 'line-through' : undefined}
              opacity={isOverridden ? 0.5 : undefined}
            >
              <InlineBlock color={color.danger}>{prop}:</InlineBlock>
              <InlineBlock color={color.text.default} marginLeft={spacing.sm}>
                {value}
                {isImportant ? ' !important' : ''};
              </InlineBlock>
            </Block>
          )
        })}
      </Block>
    </Block>
  )
}

MatchedRule.displayName = 'MatchedRule'
