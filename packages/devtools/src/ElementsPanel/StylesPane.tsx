import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React from 'react'
import { useMatchedCSSRules } from '../hooks'
import { InheritedRuleRow, MatchedRuleRow } from './MatchedRule'

export function StylesPane() {
  const { matchedRules, inheritedRules } = useMatchedCSSRules()

  const hasRules = matchedRules.length > 0 || inheritedRules.length > 0

  if (!hasRules) {
    return (
      <Block padding={16}>
        <Block
          fontSize={12}
          color={colors.slate['500']}
          textAlign="center"
          paddingTop={24}
          paddingBottom={24}
        >
          No matched CSS rules found for this element.
        </Block>
      </Block>
    )
  }

  return (
    <Block padding={16} overflow="auto">
      {matchedRules.length > 0 && (
        <Block paddingBottom={16}>
          <SectionHeader
            title="Matched CSS Rules"
            count={matchedRules.length}
          />
          <Block>
            {matchedRules.map((matchedRule, index) => (
              <MatchedRuleRow
                key={matchedRule.rule.selector + '-' + index}
                matchedRule={matchedRule}
              />
            ))}
          </Block>
        </Block>
      )}

      {inheritedRules.length > 0 && (
        <Block borderTop={`1px solid ${colors.slate['200']}`} paddingTop={16}>
          <SectionHeader
            title="Inherited Rules"
            count={inheritedRules.length}
          />
          <Block>
            {inheritedRules.map((inheritedRule, index) => (
              <InheritedRuleRow
                key={inheritedRule.rule.selector + '-' + index}
                inheritedRule={inheritedRule}
              />
            ))}
          </Block>
        </Block>
      )}
    </Block>
  )
}

interface SectionHeaderProps {
  title: string
  count: number
}

function SectionHeader({ title, count }: SectionHeaderProps) {
  return (
    <Block display="flex" alignItems="center" gap={8} marginBottom={12}>
      <Block
        fontSize={11}
        fontWeight={700}
        textTransform="uppercase"
        color={colors.slate['700']}
        letterSpacing="0.05em"
      >
        {title}
      </Block>
      <Block
        paddingTop={2}
        paddingBottom={2}
        paddingLeft={6}
        paddingRight={6}
        borderRadius={10}
        backgroundColor={colors.slate['200']}
        fontSize={10}
        fontWeight={600}
        color={colors.slate['600']}
      >
        {count}
      </Block>
    </Block>
  )
}
