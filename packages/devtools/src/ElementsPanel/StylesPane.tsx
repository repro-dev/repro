import { Block } from '@jsxstyle/react'
import { color, fontSize, fontWeight, lineHeight, spacing } from '@repro/design'
import React from 'react'

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

const Inner: React.FC<{ result: MatchedCSSRulesResult }> = ({ result }) => (
  <Block
    padding={spacing.xl}
    fontFamily="monospace"
    fontSize={fontSize.xs}
    lineHeight={lineHeight.relaxed}
  >
    {/* Inline block at top */}
    {result.inline && <MatchedRule entry={result.inline} />}

    {/* Direct rules */}
    {result.rules.map((rule, i) => (
      <Block
        key={`rule-${rule.stylesheetId}-${rule.ruleIndex}-${i}`}
        paddingTop={i > 0 || result.inline ? spacing.sm : spacing.none}
      >
        <MatchedRule entry={rule} />
      </Block>
    ))}

    {/* Inherited groups */}
    {result.inherited.map((group, i) => (
      <Block key={`inherited-${i}`} paddingTop={spacing.md}>
        <Block
          textTransform="uppercase"
          fontSize={fontSize.xs}
          fontWeight={fontWeight.bold}
          color={color.text.secondary}
          paddingBottom={spacing.sm}
        >
          Inherited from {group.ancestorLabel}
        </Block>
        {group.rules.map((rule, j) => (
          <MatchedRule
            key={`inh-rule-${rule.stylesheetId}-${rule.ruleIndex}-${j}`}
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

export const StylesPane: React.FC<StylesPaneProps> = ({
  result: externalResult,
}) => {
  const element = useSelectedElement()
  const hookResult = useMatchedCSSRules(element)

  const result = externalResult !== undefined ? externalResult : hookResult

  if (!result) {
    return (
      <Block
        padding={spacing.xl}
        color={color.text.muted}
        fontSize={fontSize.sm}
      >
        Select an element to view its styles
      </Block>
    )
  }

  return <Inner result={result} />
}

StylesPane.displayName = 'StylesPane'
