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

const Inner: React.FC<{ result: MatchedCSSRulesResult }> = ({ result }) => {
  // Build sections: section 0 = element's own styles (inline + direct rules),
  // sections 1..n = inherited groups
  const sections: Array<{
    label: string
    content: React.ReactNode
  }> = []

  // Section 0: element's own styles
  const hasOwnStyles = result.inline !== null || result.rules.length > 0
  if (hasOwnStyles) {
    sections.push({
      label: `Applied to ${result.elementLabel}`,
      content: (
        <>
          {result.inline && <MatchedRule entry={result.inline} />}
          {result.rules.map((rule, i) => (
            <Block
              key={`rule-${rule.stylesheetId}-${rule.ruleIndex}-${i}`}
              paddingTop={i > 0 || result.inline ? spacing.sm : spacing.none}
            >
              <MatchedRule entry={rule} />
            </Block>
          ))}
        </>
      ),
    })
  }

  // Sections 1..n: inherited groups
  for (let i = 0; i < result.inherited.length; i++) {
    const group = result.inherited[i]!
    sections.push({
      label: `Inherited from ${group.ancestorLabel}`,
      content: (
        <>
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
        </>
      ),
    })
  }

  if (sections.length === 0) {
    return null
  }

  return (
    <Block
      fontFamily="monospace"
      fontSize={fontSize.xs}
      lineHeight={lineHeight.relaxed}
    >
      {sections.map((section, i) => (
        <Block
          key={i}
          component="details"
          paddingTop={i > 0 ? spacing.xl : spacing.none}
          paddingBottom={spacing.xl}
          borderTop={i > 0 ? `1px solid ${color.border.default}` : ''}
          props={{ open: true }}
        >
          <Block
            component="summary"
            display="list-item"
            paddingBottom={spacing.md}
            fontSize={fontSize.xs}
            fontWeight={fontWeight.bold}
            color={color.text.secondary}
            userSelect="none"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
            props={{
              tabIndex: -1,
              title: section.label,
            }}
          >
            {section.label}
          </Block>
          {section.content}
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
