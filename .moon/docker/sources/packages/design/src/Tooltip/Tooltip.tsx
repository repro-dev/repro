import { Block } from '@jsxstyle/react'
import React, {
  MutableRefObject,
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Subscription, fromEvent, switchMap, takeUntil, timer } from 'rxjs'
import { Portal } from '../Portal'
import { colors } from '../theme'

type Props = PropsWithChildren<{
  position?: 'top' | 'bottom' | 'right' | 'left'
}>

const MAX_INT32 = 2 ** 32 - 1

export const Tooltip: React.FC<Props> = ({ children, position = 'top' }) => {
  const ref = useRef() as MutableRefObject<HTMLDivElement>
  const [active, setActive] = useState(false)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)

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

  useEffect(() => {
    const subscription = new Subscription()
    const parent = ref.current ? ref.current.parentElement : null

    if (parent) {
      const TOOLTIP_DELAY = 100

      const pointerEnter$ = fromEvent(parent, 'pointerenter')
      const pointerLeave$ = fromEvent(parent, 'pointerleave')

      subscription.add(
        pointerEnter$
          .pipe(
            switchMap(() => timer(TOOLTIP_DELAY).pipe(takeUntil(pointerLeave$)))
          )
          .subscribe(() => {
            updatePosition()
            setActive(true)
          })
      )

      subscription.add(pointerLeave$.subscribe(() => setActive(false)))
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [ref, setActive, updatePosition])

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
          borderRadius={2}
          color={colors.white}
          fontSize={11}
          whiteSpace="nowrap"
          pointerEvents="none"
          opacity={active ? 1 : 0}
          transition="opacity linear 100ms"
          userSelect="none"
          zIndex={MAX_INT32}
        >
          {children}
        </Block>
      </Portal>
    </Block>
  )
}
