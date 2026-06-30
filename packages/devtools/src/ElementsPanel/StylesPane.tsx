import { Block } from '@jsxstyle/react'
import { color, fontSize, fontWeight, lineHeight, spacing } from '@repro/design'
import React from 'react'

import { SelectorText } from './SelectorText'

import type { MatchedCSSRulesResult } from '../hooks'
import { useMatchedCSSRules, useSelectedElement } from '../hooks'
import { MatchedRule } from './MatchedRule'

interface StylesPaneProps {
  /**
   * Optional external result (for testing without hooks).
   * When omitted, the component uses useSelectedElement + useMatchedCSSRules.
   */
  result?: MatchedCSSRulesResult | null
}

const Inner: React.FC<{ result: MatchedCSSRulesResult }> = ({ result }) => {
  const hasContent =
    result.inline !== null ||
    result.rules.length > 0 ||
    result.inherited.length > 0

  if (!hasContent) {
    return null
  }

  return (
    <Block
      fontFamily="monospace"
      fontSize={fontSize.xs}
      lineHeight={lineHeight.relaxed}
    >
      {/* a) Inline block */}
      {result.inline && (
        <Block key="inline">
          <MatchedRule entry={result.inline} />
        </Block>
      )}

      {/* b) Direct rules (highest-priority-first) */}
      {result.rules.map((rule, i) => (
        <Block
          key={`rule-${rule.stylesheetId}-${rule.ruleIndex}-${i}`}
          paddingTop={i > 0 || result.inline ? spacing.sm : spacing.none}
        >
          <MatchedRule entry={rule} />
        </Block>
      ))}

      {/* c) Inherited groups */}
      {result.inherited.map((group, gi) => (
        <Block key={`inherited-${gi}`}>
          <Block
            borderTop={`1px solid ${color.border.default}`}
            paddingTop={spacing.xl}
            paddingBottom={spacing.sm}
            fontSize={fontSize.xs}
            fontWeight={fontWeight.bold}
            color={color.text.secondary}
            userSelect="none"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
            props={{ title: `Inherited from ${group.ancestorLabel}` }}
          >
            Inherited from <SelectorText text={group.ancestorLabel} />
          </Block>
          {group.rules.map((rule, j) => (
            <MatchedRule
              key={`inh-rule-${rule.stylesheetId}-${rule.ruleIndex}-${j}`}
              showSelector={false}
              entry={{
                ...rule,
                overriddenDeclarations: new Set<string>(),
                winningDeclarations: new Set<string>(),
                source: '',
              }}
            />
          ))}
        </Block>
      ))}
    </Block>
  )
}

export const StylesPane: React.FC<StylesPaneProps> = ({
  result: externalResult,
}) => {
  const element = useSelectedElement()
  const hookResult = useMatchedCSSRules(element)

  const result = externalResult !== undefined ? externalResult : hookResult

  if (!result) {
    return (
      <Block color={color.text.muted} fontSize={fontSize.sm}>
        Select an element to view its styles
      </Block>
    )
  }

  return <Inner result={result} />
}

StylesPane.displayName = 'StylesPane'
