import { Block } from '@jsxstyle/react'
import React, {
  MutableRefObject,
  PropsWithChildren,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Subscription, fromEvent, switchMap, takeUntil, timer } from 'rxjs'
import { Portal } from '../Portal'
import { colors } from '../theme'

type Props = PropsWithChildren<{
  delay?: number
  position?: 'top' | 'bottom' | 'right' | 'left'
}>

const MAX_INT32 = 2 ** 32 - 1
const DEFAULT_TOOLTIP_DELAY = 100

/**
 * Positioned tooltip that appears on hover (with configurable delay) and
 * on focus for keyboard users. Renders into a Portal.
 *
 * Place as a child of the trigger element — the tooltip attaches to its
 * parent and manages `aria-describedby` automatically. Children are the
 * tooltip content text.
 */
export const Tooltip: React.FC<Props> = ({
  children,
  delay = DEFAULT_TOOLTIP_DELAY,
  position = 'top',
}) => {
  const ref = useRef() as MutableRefObject<HTMLDivElement>
  const [active, setActive] = useState(false)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const tooltipId = useId()

  let translateX = '0'
  let translateY = '0'

  switch (position) {
    case 'top':
      translateX = '-50%'
      translateY = 'calc(-100% - 5px)'
      break

    case 'bottom':
      translateX = '-50%'
      translateY = '5px'
      break

    case 'left':
      translateX = 'calc(-100% - 5px)'
      translateY = '-50%'
      break

    case 'right':
      translateX = '5px'
      translateY = '-50%'
      break
  }

  const updatePosition = useCallback(() => {
    const parent = ref.current ? ref.current.parentElement : null

    if (parent) {
      const { top, left, width, height } = parent.getBoundingClientRect()

      switch (position) {
        case 'top':
          setX(left + width / 2)
          setY(top)
          break

        case 'bottom':
          setX(left + width / 2)
          setY(top + height)
          break

        case 'left':
          setX(left)
          setY(top + height / 2)
          break

        case 'right':
          setX(left + width)
          setY(top + height / 2)
          break
      }
    }
  }, [position, ref, setX, setY])

  // Show the tooltip and annotate the trigger with aria-describedby
  const show = useCallback(() => {
    updatePosition()
    setActive(true)
    const parent = ref.current?.parentElement
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
  }, [tooltipId, updatePosition])

  // Hide the tooltip and remove only this tooltip's id from aria-describedby
  const hide = useCallback(() => {
    setActive(false)
    const parent = ref.current?.parentElement
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
    const parent = ref.current ? ref.current.parentElement : null

    if (parent) {
      const pointerEnter$ = fromEvent(parent, 'pointerenter')
      const pointerLeave$ = fromEvent(parent, 'pointerleave')

      subscription.add(
        pointerEnter$
          .pipe(switchMap(() => timer(delay).pipe(takeUntil(pointerLeave$))))
          .subscribe(() => show())
      )

      subscription.add(pointerLeave$.subscribe(() => hide()))

      // Focus-based trigger for keyboard users
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
  }, [ref, delay, show, hide])

  return (
    <Block position="absolute" props={{ ref }}>
      <Portal>
        <Block
          padding={8}
          position="absolute"
          top={y}
          left={x}
          transform={`translate(${translateX}, ${translateY})`}
          transformOrigin="0 0"
          backgroundColor={colors.slate['700']}
          borderRadius={8}
          color={colors.white}
          fontSize={11}
          whiteSpace="nowrap"
          pointerEvents="none"
          opacity={active ? 1 : 0}
          transition="opacity linear 100ms"
          userSelect="none"
          zIndex={MAX_INT32}
          props={{
            id: tooltipId,
            role: 'tooltip',
            'aria-hidden': !active,
          }}
        >
          {children}
        </Block>
      </Portal>
    </Block>
  )
}
