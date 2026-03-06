import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  useTransitionStyles,
} from '@floating-ui/react'
import { Block } from '@jsxstyle/react'
import React, {
  MutableRefObject,
  PropsWithChildren,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Subscription, fromEvent, switchMap, takeUntil, timer } from 'rxjs'
import { Portal } from '../Portal'
import { color } from '../tokens/colors'
import { radius, zIndex } from '../tokens/elevation'
import { delay as delayTokens } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { fontSize } from '../tokens/typography'

const OFFSET = 5

type Props = PropsWithChildren<{
  delay?: number
  position?: 'top' | 'bottom' | 'right' | 'left'
}>

/**
 * Positioned tooltip that appears on hover (with configurable delay) and
 * on focus for keyboard users. Renders into a Portal.
 *
 * Place as a child of the trigger element — the tooltip attaches to its
 * parent and manages `aria-describedby` automatically. Children are the
 * tooltip content text.
 *
 * Uses `@floating-ui/react` for viewport-aware positioning with automatic
 * flip and shift behavior.
 */
export const Tooltip: React.FC<Props> = ({
  children,
  delay = delayTokens.tooltip,
  position = 'top',
}) => {
  const anchorRef = useRef() as MutableRefObject<HTMLDivElement>
  const [active, setActive] = useState(false)
  const tooltipId = useId()

  const { refs, floatingStyles, context } = useFloating({
    open: active,
    placement: position,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(OFFSET),
      flip({ padding: spacing.md }),
      shift({ padding: spacing.md }),
    ],
  })

  const { styles: transitionStyles } = useTransitionStyles(context, {
    duration: {
      open: 100,
      close: 100,
    },
    initial: {
      opacity: 0,
    },
  })

  useEffect(() => {
    const parent = anchorRef.current?.parentElement
    if (!parent) {
      return
    }

    refs.setReference(parent)
  }, [refs])

  const mergedStyles = useMemo(
    () => ({
      ...floatingStyles,
      ...transitionStyles,
    }),
    [floatingStyles, transitionStyles]
  )

  const show = useCallback(() => {
    setActive(true)
    const parent = anchorRef.current?.parentElement
    if (parent) {
      const existing = parent.getAttribute('aria-describedby')
      if (existing) {
        const ids = existing.split(/\s+/).filter(Boolean)
        if (!ids.includes(tooltipId)) {
          ids.push(tooltipId)
        }
        parent.setAttribute('aria-describedby', ids.join(' '))
      } else {
        parent.setAttribute('aria-describedby', tooltipId)
      }
    }
  }, [tooltipId])

  const hide = useCallback(() => {
    setActive(false)
    const parent = anchorRef.current?.parentElement
    if (parent) {
      const existing = parent.getAttribute('aria-describedby')
      if (existing) {
        const remainingIds = existing
          .split(/\s+/)
          .filter(Boolean)
          .filter(id => id !== tooltipId)

        if (remainingIds.length > 0) {
          parent.setAttribute('aria-describedby', remainingIds.join(' '))
        } else {
          parent.removeAttribute('aria-describedby')
        }
      }
    }
  }, [tooltipId])

  useEffect(() => {
    const subscription = new Subscription()
    const parent = anchorRef.current?.parentElement

    if (parent) {
      const pointerEnter$ = fromEvent(parent, 'pointerenter')
      const pointerLeave$ = fromEvent(parent, 'pointerleave')

      subscription.add(
        pointerEnter$
          .pipe(switchMap(() => timer(delay).pipe(takeUntil(pointerLeave$))))
          .subscribe(() => show())
      )

      subscription.add(pointerLeave$.subscribe(() => hide()))

      const handleFocus = () => show()
      const handleBlur = () => hide()
      parent.addEventListener('focus', handleFocus, true)
      parent.addEventListener('blur', handleBlur, true)

      subscription.add({
        unsubscribe: () => {
          parent.removeEventListener('focus', handleFocus, true)
          parent.removeEventListener('blur', handleBlur, true)
        },
      })
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [delay, show, hide])

  return (
    <Block position="absolute" props={{ ref: anchorRef }}>
      <Portal>
        <Block
          padding={spacing.md}
          backgroundColor={color.text.secondary}
          borderRadius={radius.md}
          color={color.text.inverse}
          fontSize={fontSize.xs}
          whiteSpace="nowrap"
          pointerEvents="none"
          userSelect="none"
          zIndex={zIndex.portal}
          width="max-content"
          props={{
            ref: refs.setFloating,
            id: tooltipId,
            role: 'tooltip',
            'aria-hidden': !active,
            style: mergedStyles,
          }}
        >
          {children}
        </Block>
      </Portal>
    </Block>
  )
}
