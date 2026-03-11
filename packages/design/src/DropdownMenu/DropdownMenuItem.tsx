import { Block } from '@jsxstyle/react'
import React, { forwardRef, useCallback, useRef } from 'react'
import mergeRefs from 'react-merge-refs'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { useDropdownMenuContext } from './DropdownMenuContext'

export interface DropdownMenuItemProps {
  children: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  destructive?: boolean
}

/**
 * Individual action within a dropdown menu. Renders as a `role="menuitem"`
 * element with keyboard and pointer interaction.
 *
 * Use `onSelect` to handle activation. Set `destructive` for danger-styled
 * items (e.g. delete actions) and `disabled` for non-interactive items.
 */
export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  DropdownMenuItemProps
>(({ children, onSelect, disabled = false, destructive = false }, ref) => {
  const { getItemProps, listRef, setOpen } = useDropdownMenuContext()
  const internalRef = useRef<HTMLDivElement | null>(null)

  const indexRef = useRef<number>(-1)

  const setItemRef = useCallback(
    (node: HTMLElement | null) => {
      internalRef.current = node as HTMLDivElement | null
      const list = listRef.current
      if (node) {
        const existing = list.indexOf(node)
        if (existing === -1) {
          const emptyIndex = list.indexOf(null)
          if (emptyIndex !== -1) {
            list[emptyIndex] = node
            indexRef.current = emptyIndex
          } else {
            indexRef.current = list.length
            list.push(node)
          }
        } else {
          indexRef.current = existing
        }
      }
    },
    [listRef]
  )

  const handleSelect = useCallback(() => {
    if (!disabled) {
      onSelect()
      setOpen(false)
    }
  }, [disabled, onSelect, setOpen])

  const textColor = disabled
    ? color.text.muted
    : destructive
    ? color.danger
    : color.text.default

  const hoverBg = disabled
    ? undefined
    : destructive
    ? color.dangerSubtle
    : color.bg.hover

  return (
    <Block
      {...textStyles.body}
      color={textColor}
      padding={`${spacing.md}px ${spacing.lg}px`}
      borderRadius={radius.sm}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.5 : 1}
      transition={transition.fast}
      hoverBackgroundColor={hoverBg}
      {...focusRing()}
      props={{
        ref: mergeRefs([ref, setItemRef].filter(Boolean)),
        role: 'menuitem',
        tabIndex: disabled ? -1 : 0,
        'aria-disabled': disabled || undefined,
        ...getItemProps({
          onClick: handleSelect,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleSelect()
            }
          },
        }),
      }}
    >
      {children}
    </Block>
  )
})

DropdownMenuItem.displayName = 'DropdownMenuItem'
