import { Block, Col } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React from 'react'
import { useMatchedCSSRules } from '../hooks'
import { InheritedRuleRow, MatchedRuleRow } from './MatchedRule'

export const StylesPane: React.FC = () => {
  const { matchedRules, inheritedRules } = useMatchedCSSRules()

  if (!matchedRules.length && !inheritedRules.length) {
    return (
      <Block
        padding={16}
        fontSize={12}
        color={colors.slate['500']}
        fontStyle="italic"
      >
        No CSS rules matched for this element.
      </Block>
    )
  }

  return (
    <Col>
      {matchedRules.length > 0 && (
        <Block>
          <Block
            paddingTop={8}
            paddingBottom={4}
            paddingLeft={12}
            paddingRight={12}
            fontSize={10}
            fontWeight={700}
            textTransform="uppercase"
            color={colors.slate['500']}
            letterSpacing="0.05em"
          >
            Matched Rules
          </Block>
          {matchedRules.map((mr, i) => (
            <MatchedRuleRow key={i} matchedRule={mr} />
          ))}
        </Block>
      )}

      {inheritedRules.length > 0 && (
        <Block borderTop={`1px solid ${colors.slate['200']}`} marginTop={8}>
          <Block
            paddingTop={8}
            paddingBottom={4}
            paddingLeft={12}
            paddingRight={12}
            fontSize={10}
            fontWeight={700}
            textTransform="uppercase"
            color={colors.slate['500']}
            letterSpacing="0.05em"
          >
            Inherited
          </Block>
          {inheritedRules.map((ir, i) => (
            <InheritedRuleRow key={i} inheritedRule={ir} />
          ))}
        </Block>
      )}
    </Col>
  )
}
