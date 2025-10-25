import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React, { MutableRefObject, useEffect, useRef } from 'react'
import { Subscription, fromEvent, map, switchMap, take, takeUntil } from 'rxjs'
import { usePlayback } from '../hooks'
import { SimpleTimeline } from './SimpleTimeline'

export interface Props {
  onChange?: (min: number, max: number) => void
}

function useCallbackRef<T extends (...args: any[]) => unknown>(
  cb: T | undefined
) {
  const ref = useRef(cb)

  useEffect(() => {
    ref.current = cb
  }, [ref, cb])

  return ref
}

export const RangeTimeline: React.FC<Props> = ({ onChange }) => {
  const playback = usePlayback()
  const onChangeRef = useCallbackRef(onChange)
  const containerRef = useRef() as MutableRefObject<HTMLDivElement>

  useEffect(() => {
    const subscription = new Subscription()
    const root = containerRef.current

    if (root) {
      const lowerBoundBackground = createBoundBackgroundElement('left')
      const upperBoundBackground = createBoundBackgroundElement('right')
      const lowerBoundHandle = createBoundHandleElement('left')
      const upperBoundHandle = createBoundHandleElement('right')

      root.append(
        lowerBoundBackground,
        upperBoundBackground,
        lowerBoundHandle,
        upperBoundHandle
      )

      let min = 0
      let max = playback.getDuration()

      function updateMin(value: number) {
        if (value === min) {
          return
        }

        if (value > max) {
          value = max
        }

        if (value < 0) {
          value = 0
        }

        min = value

        playback.seekToTime(value)

        if (onChangeRef.current) {
          onChangeRef.current(min, max)
        }
      }

      function updateMax(value: number) {
        if (value === max) {
          return
        }

        if (value < min) {
          value = min
        }

        if (value > playback.getDuration()) {
          value = playback.getDuration()
        }

        max = value

        playback.seekToTime(value)

        if (onChangeRef.current) {
          onChangeRef.current(min, max)
        }
      }

      function mapPointerEventToLeftOffset(evt: PointerEvent) {
        const { x: rootOffsetX, width: rootWidth } =
          root?.getBoundingClientRect()
        return Math.max(0, Math.min(1, (evt.clientX - rootOffsetX) / rootWidth))
      }

      function mapPointerEventToRightOffset(evt: PointerEvent) {
        const { x: rootOffsetX, width: rootWidth } =
          root?.getBoundingClientRect()
        return Math.max(
          0,
          Math.min(1, (rootWidth - (evt.clientX - rootOffsetX)) / rootWidth)
        )
      }

      function mapLeftOffsetToValue(offset: number) {
        return playback.getDuration() * offset
      }

      function mapRightOffsetToValue(offset: number) {
        return playback.getDuration() * (1 - offset)
      }

      // Direct events
      const lowerPointerDown$ = fromEvent<PointerEvent>(
        lowerBoundHandle,
        'pointerdown'
      )

      const upperPointerDown$ = fromEvent<PointerEvent>(
        upperBoundHandle,
        'pointerdown'
      )

      // Indirect events
      const pointerMove$ = fromEvent<PointerEvent>(window, 'pointermove')
      const pointerUp$ = fromEvent<PointerEvent>(window, 'pointerup')

      subscription.add(
        lowerPointerDown$
          .pipe(
            switchMap(() => pointerMove$.pipe(takeUntil(pointerUp$))),
            map(mapPointerEventToLeftOffset)
          )
          .subscribe(offset => {
            updateLowerBoundOffset(lowerBoundHandle, offset)
            updateBackgroundOffset(lowerBoundBackground, offset)
          })
      )

      subscription.add(
        lowerPointerDown$
          .pipe(
            switchMap(() => pointerUp$.pipe(take(1))),
            map(mapPointerEventToLeftOffset),
            map(mapLeftOffsetToValue)
          )
          .subscribe(updateMin)
      )

      subscription.add(
        upperPointerDown$
          .pipe(
            switchMap(() => pointerUp$.pipe(take(1))),
            map(mapPointerEventToRightOffset),
            map(mapRightOffsetToValue)
          )
          .subscribe(updateMax)
      )

      subscription.add(
        upperPointerDown$
          .pipe(
            switchMap(() => pointerMove$.pipe(takeUntil(pointerUp$))),
            map(mapPointerEventToRightOffset)
          )
          .subscribe(offset => {
            updateUpperBoundOffset(upperBoundHandle, offset)
            updateBackgroundOffset(upperBoundBackground, offset)
          })
      )

      subscription.add(
        playback.$elapsed.subscribe(elapsed => {
          if (elapsed < min) {
            playback.seekToTime(min)
          } else if (elapsed > max) {
            playback.pause()
            playback.seekToTime(max)
          }
        })
      )
    }

    return () => {
      subscription.unsubscribe()

      if (root) {
        while (root.firstChild) {
          root.firstChild.remove()
        }
      }
    }
  }, [playback, containerRef, onChangeRef])

  return (
    <Block position="relative">
      <SimpleTimeline>
        <Block
          position="absolute"
          left={0}
          right={0}
          top={0}
          bottom={0}
          pointerEvents="none"
          props={{ ref: containerRef }}
        />
      </SimpleTimeline>
    </Block>
  )
}

function createBoundBackgroundElement(anchor: 'left' | 'right') {
  return createElement([
    ['backgroundColor', colors.slate['400']],
    ['height', '100%'],
    [anchor, '0'],
    ['pointerEvents', 'auto'],
    ['position', 'absolute'],
    ['scale', '0 1'],
    ['top', '0'],
    ['transformOrigin', `center ${anchor}`],
    ['width', '100%'],
  ])
}

function createBoundHandleElement(anchor: 'left' | 'right') {
  const elem = createElement([
    ['cursor', 'col-resize'],
    ['height', '12px'],
    ['pointerEvents', 'auto'],
    ['position', 'absolute'],
    ['top', '40%'],
    ['width', '12px'],
    [anchor, '0'],
    ['translate', `${anchor === 'left' ? '-50%' : '50%'} -50%`],
  ])

  const head = createElement([
    ['backgroundColor', colors.blue['700']],
    ['height', '12px'],
  ])

  const tail = createElement([
    [
      'borderColor',
      `${colors.blue['700']} transparent transparent transparent`,
    ],
    ['borderStyle', 'solid'],
    ['borderWidth', '6px'],
  ])

  elem.append(head, tail)

  return elem
}

function createElement(styles: Array<[keyof CSSStyleDeclaration, string]>) {
  const elem = document.createElement('div')

  for (const [key, value] of styles) {
    // @ts-ignore
    elem.style[key] = value
  }

  return elem
}

function updateLowerBoundOffset(target: HTMLElement, offset: number) {
  target.style.left = `${offset * 100}%`
}

function updateUpperBoundOffset(target: HTMLElement, offset: number) {
  target.style.right = `${offset * 100}%`
}

function updateBackgroundOffset(target: HTMLElement, offset: number) {
  target.style.scale = `${offset} 1`
}
