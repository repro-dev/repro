import { Block } from '@jsxstyle/react'
import React, { forwardRef, useCallback, useRef, useState } from 'react'
import mergeRefs from 'react-merge-refs'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
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
  const { getItemProps, listRef, setOpen, activeIndex, refs } =
    useDropdownMenuContext()
  const internalRef = useRef<HTMLDivElement | null>(null)

  const [itemIndex, setItemIndex] = useState<number>(-1)
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
        setItemIndex(indexRef.current)
      } else {
        if (indexRef.current !== -1) {
          list[indexRef.current] = null
          indexRef.current = -1
        }
        setItemIndex(-1)
      }
    },
    [listRef]
  )

  const handleSelect = useCallback(() => {
    if (!disabled) {
      onSelect()
      setOpen(false)
      ;(refs.domReference.current as HTMLElement | null)?.focus()
    }
  }, [disabled, onSelect, setOpen, refs])

  const isActive = activeIndex === itemIndex

  const textColor = disabled
    ? color.text.muted
    : destructive
    ? color.danger
    : color.text.default

  const bgColor =
    isActive && !disabled && destructive
      ? color.dangerSubtle
      : isActive && !disabled
      ? color.bg.hover
      : 'transparent'

  return (
    <Block
      {...textStyles.bodySmall}
      color={textColor}
      backgroundColor={bgColor}
      padding={`${spacing.md}px ${spacing.lg}px`}
      borderRadius={radius.sm}
      outline="none"
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.5 : 1}
      props={{
        ref: mergeRefs([ref, setItemRef].filter(Boolean)),
        role: 'menuitem',
        tabIndex: disabled ? -1 : itemIndex === activeIndex ? 0 : -1,
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
