import { Block, InlineBlock, Row } from '@jsxstyle/react'
import {
  color,
  fontSize,
  fontWeight,
  lineHeight,
  spacing,
  Tooltip,
} from '@repro/design'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { MatchedRuleEntry } from '../hooks'

interface MatchedRuleProps {
  entry: MatchedRuleEntry
  /** Show the selector + source header row. Defaults to true; set false for
   * inherited rules where the "Inherited from…" heading already provides context. */
  showSelector?: boolean
}

export const MatchedRule: React.FC<MatchedRuleProps> = ({
  entry,
  showSelector = true,
}) => {
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

  const selectorRef = useRef<HTMLDivElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  const checkTruncation = useCallback(() => {
    const el = selectorRef.current
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth)
    }
  }, [])

  // Check truncation on mount and when the selector text changes
  useEffect(() => {
    checkTruncation()
  }, [checkTruncation, selectorText])

  // Re-check truncation on layout changes. ResizeObserver is available in
  // the devtools runtime; skip gracefully in constrained/test environments
  // (the mount + selector-change effect above still provides the signal).
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const el = selectorRef.current
    if (!el) {
      return
    }

    const observer = new ResizeObserver(() => {
      checkTruncation()
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [checkTruncation])

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
          Skipped for inherited rules (showSelector=false) where the
          "Inherited from…" heading already provides context. */}
      {showSelector && (
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
            props={{ ref: selectorRef }}
          >
            {selectorText || 'element.style'}
            {selectorText && isTruncated && (
              <Tooltip position="top-start">{selectorText}</Tooltip>
            )}
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
      )}

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
