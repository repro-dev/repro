import { Block, Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { Avatar } from '../Avatar'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export type AvatarStackSummaryItem = {
  id?: React.Key
  email?: string
  name?: string
}

type SizeVariant = 'small' | 'medium' | 'large'

type SharedAvatarStackSummaryProps = {
  /** People or entities to represent in the compact avatar stack. */
  items: readonly AvatarStackSummaryItem[]
  /** Maximum number of avatars to render before switching to overflow copy. */
  maxVisible?: number
  /** Visual avatar size tier. */
  size?: SizeVariant
  /** Optional total/context label, such as "5 users". */
  label?: React.ReactNode
  /** Formats hidden-item copy. Defaults to "and X more". */
  overflowLabel?: (overflowCount: number) => React.ReactNode
  /** Copy rendered when no items are available. */
  emptyLabel?: React.ReactNode
  /** Extra DOM props forwarded to the root element. */
  props?: Record<string, unknown>
}

type StaticAvatarStackSummaryProps = SharedAvatarStackSummaryProps & {
  href?: undefined
  component?: undefined
  target?: undefined
  rel?: undefined
  /** Accessible label for the static group. Adds role="group" when present. */
  ariaLabel?: string
}

type LinkedAvatarStackSummaryProps = SharedAvatarStackSummaryProps & {
  /** Href for the single linked summary target. */
  href: string
  /** Optional root tag override. Defaults to "a". */
  component?: 'a'
  target?: string
  rel?: string
  /** Required accessible name for the linked summary target. */
  ariaLabel: string
}

export type AvatarStackSummaryProps =
  | StaticAvatarStackSummaryProps
  | LinkedAvatarStackSummaryProps

const avatarSizes: Record<SizeVariant, number> = {
  small: 24,
  medium: 30,
  large: 36,
}

function getItemKey(item: AvatarStackSummaryItem, index: number): React.Key {
  return item.id ?? item.email ?? item.name ?? index
}

function getOverflowLabel(count: number): React.ReactNode {
  return `and ${count} more`
}

/**
 * Compact overlapping avatar stack with optional total, overflow, empty, and
 * single-link summary states for member/account metadata rows.
 */
export const AvatarStackSummary = forwardRef<
  HTMLElement,
  AvatarStackSummaryProps
>(
  (
    {
      items,
      maxVisible = 3,
      size = 'small',
      label,
      overflowLabel = getOverflowLabel,
      emptyLabel = 'No users',
      ariaLabel,
      props: rootProps,
      ...rootOptions
    },
    ref
  ) => {
    const visibleCount = Math.max(0, maxVisible)
    const visibleItems = items.slice(0, visibleCount)
    const overflowCount = Math.max(0, items.length - visibleItems.length)
    const avatarSize = avatarSizes[size]
    const isLinked = 'href' in rootOptions && rootOptions.href !== undefined
    const linkedOptions = rootOptions as LinkedAvatarStackSummaryProps
    const resolvedRel =
      isLinked && linkedOptions.target === '_blank' && linkedOptions.rel == null
        ? 'noreferrer'
        : isLinked
        ? linkedOptions.rel
        : undefined

    const content = (
      <>
        {visibleItems.length > 0 && (
          <Row alignItems="center" flexShrink={0}>
            {visibleItems.map((item, index) => (
              <Block
                key={getItemKey(item, index)}
                width={avatarSize}
                height={avatarSize}
                marginLeft={index === 0 ? spacing.none : -spacing.sm}
                borderRadius={radius.full}
                overflow="hidden"
                backgroundColor={color.bg.surface}
                boxSizing="content-box"
              >
                <Avatar
                  email={item.email}
                  name={item.name}
                  mode="image-only"
                  size={avatarSize}
                />
              </Block>
            ))}
          </Row>
        )}

        <Row alignItems="baseline" gap={spacing.sm} minWidth={0}>
          {items.length === 0 ? (
            <Block {...textStyles.bodySmall} color={color.text.muted}>
              {emptyLabel}
            </Block>
          ) : (
            <>
              {label != null && (
                <Block {...textStyles.label} color="inherit">
                  {label}
                </Block>
              )}
              {overflowCount > 0 && (
                <Block {...textStyles.bodySmall} color="inherit">
                  {overflowLabel(overflowCount)}
                </Block>
              )}
            </>
          )}
        </Row>
      </>
    )

    if (isLinked) {
      return (
        <Row
          component={linkedOptions.component ?? 'a'}
          props={{
            ...rootProps,
            ref: ref as React.Ref<HTMLAnchorElement>,
            href: linkedOptions.href,
            target: linkedOptions.target,
            rel: resolvedRel,
            'aria-label': ariaLabel,
          }}
          display="inline-flex"
          alignItems="center"
          gap={spacing.md}
          minWidth={0}
          color={color.primary}
          textDecoration="none"
          hoverTextDecoration="underline"
          cursor="pointer"
          {...focusRing()}
        >
          {content}
        </Row>
      )
    }

    return (
      <Row
        component="div"
        props={{
          ...rootProps,
          ref: ref as React.Ref<HTMLDivElement>,
          role: ariaLabel ? 'group' : undefined,
          'aria-label': ariaLabel,
        }}
        display="inline-flex"
        alignItems="center"
        gap={spacing.md}
        minWidth={0}
        color={color.text.secondary}
      >
        {content}
      </Row>
    )
  }
)

AvatarStackSummary.displayName = 'AvatarStackSummary'
