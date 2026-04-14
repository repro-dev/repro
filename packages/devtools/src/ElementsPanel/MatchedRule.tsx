import { Block, Col, InlineBlock, Row } from '@jsxstyle/react'
import { CapturedCSSRule, InheritedRule, MatchedRule } from '@repro/css-utils'
import { colors } from '@repro/design'
import React from 'react'

// Extract a short display name from a stylesheet URL
function getSheetName(href: string | null): string {
  if (!href) return 'inline'
  try {
    const url = new URL(href)
    const parts = url.pathname.split('/')
    return parts[parts.length - 1] || href
  } catch {
    return href
  }
}

interface SourceBadgeProps {
  rule: CapturedCSSRule
}

const SourceBadge: React.FC<SourceBadgeProps> = ({ rule }) => {
  const label = rule.isInline
    ? 'INLINE'
    : rule.isCrossOrigin
    ? 'CROSS-ORIGIN'
    : getSheetName(rule.sourceStylesheet)

  const bg = rule.isCrossOrigin ? colors.rose['100'] : colors.slate['100']
  const textColor = rule.isCrossOrigin
    ? colors.rose['700']
    : colors.slate['600']

  return (
    <InlineBlock
      fontSize={10}
      fontFamily="monospace"
      padding="1px 4px"
      borderRadius={3}
      backgroundColor={bg}
      color={textColor}
    >
      {label}
    </InlineBlock>
  )
}

interface MediaBadgeProps {
  rule: CapturedCSSRule
}

const MediaBadge: React.FC<MediaBadgeProps> = ({ rule }) => {
  if (!rule.mediaCondition && !rule.supportsCondition) return null

  const label = rule.supportsCondition
    ? `@supports ${rule.supportsCondition}`
    : `@media ${rule.mediaCondition}`

  return (
    <InlineBlock
      fontSize={10}
      fontFamily="monospace"
      padding="1px 4px"
      borderRadius={3}
      backgroundColor={colors.purple['100']}
      color={colors.purple['700']}
      marginLeft={4}
    >
      {label}
    </InlineBlock>
  )
}

interface MatchedRuleRowProps {
  matchedRule: MatchedRule
}

export const MatchedRuleRow: React.FC<MatchedRuleRowProps> = ({
  matchedRule,
}) => {
  const { rule, overriddenDeclarations } = matchedRule
  const propertyKeys = Object.keys(rule.declarations)

  return (
    <Block
      paddingTop={8}
      paddingBottom={8}
      paddingLeft={12}
      paddingRight={12}
      borderBottom={`1px solid ${colors.slate['100']}`}
    >
      {/* Selector line */}
      <Row alignItems="center" marginBottom={4} flexWrap="wrap" gap={4}>
        <InlineBlock
          fontFamily="monospace"
          fontSize={11}
          fontWeight={600}
          color={colors.slate['700']}
          marginRight={4}
        >
          {rule.selector || '(no selector)'}
        </InlineBlock>
        <SourceBadge rule={rule} />
        <MediaBadge rule={rule} />
      </Row>

      {/* Declarations */}
      <Col paddingLeft={12}>
        {propertyKeys.map(key => {
          const value = rule.declarations[key] ?? ''
          const isOverridden = overriddenDeclarations.has(key)
          return (
            <Block
              key={key}
              fontFamily="monospace"
              fontSize={11}
              lineHeight={1.5}
              opacity={isOverridden ? 0.5 : 1}
              textDecoration={isOverridden ? 'line-through' : 'none'}
            >
              <InlineBlock color={colors.rose['500']}>{key}:</InlineBlock>
              <InlineBlock color={colors.slate['700']} marginLeft={8}>
                {value};
              </InlineBlock>
            </Block>
          )
        })}
      </Col>
    </Block>
  )
}

interface InheritedRuleRowProps {
  inheritedRule: InheritedRule
}

export const InheritedRuleRow: React.FC<InheritedRuleRowProps> = ({
  inheritedRule,
}) => {
  const { rule, inheritedFrom } = inheritedRule
  const propertyKeys = Object.keys(rule.declarations)

  const ancestorLabel = inheritedFrom
    ? inheritedFrom.tagName.toLowerCase() +
      (inheritedFrom.id ? `#${inheritedFrom.id}` : '') +
      (inheritedFrom.className
        ? `.${String(inheritedFrom.className).split(' ').join('.')}`
        : '')
    : 'ancestor'

  return (
    <Block
      paddingTop={8}
      paddingBottom={8}
      paddingLeft={12}
      paddingRight={12}
      borderBottom={`1px solid ${colors.slate['100']}`}
    >
      {/* Inherited-from indicator */}
      <Row alignItems="center" marginBottom={2}>
        <InlineBlock
          fontSize={10}
          color={colors.slate['500']}
          fontStyle="italic"
          marginRight={4}
        >
          Inherited from
        </InlineBlock>
        <InlineBlock
          fontFamily="monospace"
          fontSize={10}
          color={colors.blue['600']}
        >
          {ancestorLabel}
        </InlineBlock>
      </Row>

      {/* Selector */}
      <Row alignItems="center" marginBottom={4} flexWrap="wrap" gap={4}>
        <InlineBlock
          fontFamily="monospace"
          fontSize={11}
          fontWeight={600}
          color={colors.slate['600']}
          marginRight={4}
        >
          {rule.selector || '(no selector)'}
        </InlineBlock>
        <SourceBadge rule={rule} />
        <MediaBadge rule={rule} />
      </Row>

      {/* Declarations */}
      <Col paddingLeft={12}>
        {propertyKeys.map(key => {
          const value = rule.declarations[key] ?? ''
          return (
            <Block
              key={key}
              fontFamily="monospace"
              fontSize={11}
              lineHeight={1.5}
            >
              <InlineBlock color={colors.rose['400']}>{key}:</InlineBlock>
              <InlineBlock color={colors.slate['600']} marginLeft={8}>
                {value};
              </InlineBlock>
            </Block>
          )
        })}
      </Col>
    </Block>
  )
}
