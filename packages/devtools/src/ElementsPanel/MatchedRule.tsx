import { Block, Inline, InlineBlock } from '@jsxstyle/react'
import { type InheritedRule, type MatchedRule } from '@repro/css-utils'
import { colors } from '@repro/design'
import { Crosshair } from 'lucide-react'
import React from 'react'

interface MatchedRuleProps {
  matchedRule: MatchedRule
}

export function MatchedRuleRow({ matchedRule }: MatchedRuleProps) {
  const { rule, overriddenDeclarations } = matchedRule

  return (
    <Block paddingTop={4} paddingBottom={4}>
      <Block display="flex" alignItems="center" gap={8} marginBottom={4}>
        <SourceBadge rule={rule} />
        {rule.mediaCondition && <MediaBadge condition={rule.mediaCondition} />}
      </Block>

      <Block
        fontFamily="monospace"
        fontSize={11}
        color={colors.slate['800']}
        marginBottom={4}
        wordBreak="break-all"
      >
        <strong>{rule.selector}</strong>
      </Block>

      <Block fontFamily="monospace" fontSize={11}>
        {Object.entries(rule.declarations).map(([property, value]) => {
          const isOverriddenDecl = overriddenDeclarations.has(property)
          return (
            <Block
              key={property}
              lineHeight={1.6}
              color={
                isOverriddenDecl ? colors.slate['400'] : colors.slate['700']
              }
              textDecoration={isOverriddenDecl ? 'line-through' : 'none'}
            >
              <InlineBlock
                color={colors.rose['500']}
                width={120}
                flexShrink={0}
              >
                {property}:
              </InlineBlock>
              <InlineBlock color={colors.emerald['600']} marginLeft={8}>
                {value};
              </InlineBlock>
            </Block>
          )
        })}
      </Block>
    </Block>
  )
}

interface InheritedRuleRowProps {
  inheritedRule: InheritedRule
}

export function InheritedRuleRow({ inheritedRule }: InheritedRuleRowProps) {
  const { rule, inheritedFrom } = inheritedRule

  return (
    <Block paddingTop={4} paddingBottom={4}>
      <Block display="flex" alignItems="center" gap={8} marginBottom={4}>
        <SourceBadge rule={rule} />
        {inheritedFrom && (
          <InlineBlock
            display="flex"
            alignItems="center"
            gap={4}
            color={colors.slate['500']}
            fontSize={10}
            cursor="pointer"
            title={'Inherited from: ' + getElementSelector(inheritedFrom)}
          >
            <Crosshair size={10} />
            <Inline
              component="span"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              maxWidth={120}
            >
              {getElementSelector(inheritedFrom)}
            </Inline>
          </InlineBlock>
        )}
        {rule.mediaCondition && <MediaBadge condition={rule.mediaCondition} />}
      </Block>

      <Block
        fontFamily="monospace"
        fontSize={11}
        color={colors.slate['600']}
        marginBottom={4}
        wordBreak="break-all"
        fontStyle="italic"
      >
        {rule.selector}
      </Block>

      <Block fontFamily="monospace" fontSize={11} color={colors.slate['500']}>
        {Object.entries(rule.declarations).map(([property, value]) => (
          <Block key={property} lineHeight={1.6}>
            <InlineBlock color={colors.rose['400']} width={120} flexShrink={0}>
              {property}:
            </InlineBlock>
            <InlineBlock color={colors.emerald['500']} marginLeft={8}>
              {value};
            </InlineBlock>
          </Block>
        ))}
      </Block>
    </Block>
  )
}

interface SourceBadgeProps {
  rule: {
    isInline: boolean
    isCrossOrigin: boolean
    sourceStylesheet: string | null
  }
}

function SourceBadge({ rule }: SourceBadgeProps) {
  if (rule.isCrossOrigin) {
    return (
      <InlineBlock
        paddingTop={2}
        paddingBottom={2}
        paddingLeft={6}
        paddingRight={6}
        borderRadius={4}
        backgroundColor={colors.amber['100']}
        color={colors.amber['700']}
        fontSize={10}
        fontWeight={600}
      >
        CROSS-ORIGIN
      </InlineBlock>
    )
  }

  if (rule.isInline) {
    return (
      <InlineBlock
        paddingTop={2}
        paddingBottom={2}
        paddingLeft={6}
        paddingRight={6}
        borderRadius={4}
        backgroundColor={colors.blue['100']}
        color={colors.blue['700']}
        fontSize={10}
        fontWeight={600}
      >
        INLINE
      </InlineBlock>
    )
  }

  const filename = rule.sourceStylesheet
    ? getFilenameFromUrl(rule.sourceStylesheet)
    : 'stylesheet'

  return (
    <InlineBlock
      paddingTop={2}
      paddingBottom={2}
      paddingLeft={6}
      paddingRight={6}
      borderRadius={4}
      backgroundColor={colors.slate['100']}
      color={colors.slate['600']}
      fontSize={10}
      fontWeight={600}
      title={rule.sourceStylesheet ?? undefined}
    >
      {filename}
    </InlineBlock>
  )
}

interface MediaBadgeProps {
  condition: string
}

function MediaBadge({ condition }: MediaBadgeProps) {
  const display =
    condition.length > 40 ? condition.slice(0, 40) + '...' : condition

  return (
    <InlineBlock
      paddingTop={2}
      paddingBottom={2}
      paddingLeft={6}
      paddingRight={6}
      borderRadius={4}
      backgroundColor={colors.purple['100']}
      color={colors.purple['700']}
      fontSize={10}
      fontWeight={600}
      title={condition}
    >
      {display}
    </InlineBlock>
  )
}

function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const parts = pathname.split('/')
    return parts[parts.length - 1] || 'stylesheet'
  } catch {
    return url.slice(0, 20)
  }
}

function getElementSelector(element: Element): string {
  if (element.id) {
    return '#' + element.id
  }

  const tagName = element.tagName.toLowerCase()
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).slice(0, 2)
    if (classes.length > 0 && classes[0]) {
      return tagName + '.' + classes.join('.')
    }
  }

  return tagName
}
