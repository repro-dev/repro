import { Placement } from '@floating-ui/react'
import { Block, Col } from '@jsxstyle/react'
import React, { forwardRef, useCallback, useEffect } from 'react'
import mergeRefs from 'react-merge-refs'
import { Portal } from '../Portal'
import { color } from '../tokens/colors'
import { radius, shadow, zIndex } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { useDropdownMenuContext } from './DropdownMenuContext'

export interface DropdownMenuContentProps {
  children: React.ReactNode
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
}

function buildPlacement(
  side: 'top' | 'bottom',
  align: 'start' | 'end'
): Placement {
  return `${side}-${align}`
}

/**
 * Floating panel that contains menu items. Renders into a Portal and is
 * positioned relative to the trigger via `@floating-ui/react`.
 *
 * Accepts `align` and `side` props to control placement. Includes
 * enter/exit transition animation (scale + opacity).
 */
export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  DropdownMenuContentProps
>(({ children, align = 'start', side = 'bottom' }, ref) => {
  const {
    refs,
    floatingStyles,
    getFloatingProps,
    isMounted,
    transitionStyles,
    setPlacement,
    setOpen,
  } = useDropdownMenuContext()

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') {
        return
      }

      e.preventDefault()
      setOpen(false)
      ;(refs.domReference.current as HTMLElement | null)?.focus()
    },
    [refs, setOpen]
  )

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      const relatedTarget = e.relatedTarget as Node | null
      const floating = e.currentTarget as HTMLElement
      const reference = refs.domReference.current as HTMLElement | null

      if (
        relatedTarget &&
        (floating.contains(relatedTarget) ||
          reference?.contains(relatedTarget) ||
          relatedTarget === reference)
      ) {
        return
      }

      setOpen(false)
    },
    [refs, setOpen]
  )

  useEffect(() => {
    setPlacement(buildPlacement(side, align))
  }, [side, align, setPlacement])

  if (!isMounted) {
    return null
  }

  return (
    <Portal>
      <Block
        zIndex={zIndex.portal}
        outline="none"
        props={{
          ref: mergeRefs([ref, refs.setFloating].filter(Boolean)),
          style: floatingStyles,
          ...getFloatingProps({
            onKeyDown: handleKeyDown,
          }),
          onBlur: handleBlur,
        }}
      >
        <Col
          backgroundColor={color.bg.surface}
          borderRadius={radius.md}
          boxShadow={shadow.md}
          border={`1px solid ${color.border.strong}`}
          padding={spacing.sm}
          minWidth={160}
          props={{
            style: transitionStyles,
          }}
        >
          {children}
        </Col>
      </Block>
    </Portal>
  )
})

DropdownMenuContent.displayName = 'DropdownMenuContent'
