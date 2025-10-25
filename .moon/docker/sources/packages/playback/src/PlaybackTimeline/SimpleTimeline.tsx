import { Block, Row } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { formatTime } from '@repro/date-utils'
import { colors } from '@repro/design'
import React, {
  MutableRefObject,
  PropsWithChildren,
  useEffect,
  useRef,
} from 'react'
import { NEVER, Observable, Subscription, combineLatest, fromEvent } from 'rxjs'
import {
  distinctUntilChanged,
  map,
  startWith,
  switchMap,
  take,
  takeUntil,
} from 'rxjs/operators'
import { usePlayback } from '../hooks'
import { PlaybackState } from '../types'
import { PlayAction } from './PlayAction'

export interface Props {
  min?: number
  max?: number
}

export const SimpleTimeline: React.FC<PropsWithChildren<Props>> = ({
  children,
  min,
  max,
}) => {
  const progressRef = useRef() as MutableRefObject<HTMLDivElement>
  const elapsedTimeRef = useRef() as MutableRefObject<HTMLDivElement>
  const playback = usePlayback()

  useEffect(() => {
    const subscription = new Subscription()
    const root = progressRef.current

    if (root) {
      const background = createBackgroundElement()
      const buffer = createBufferElement()
      const ghost = createGhostElement()
      const progress = createProgressElement()
      const tooltip = createTooltipElement()
      const elapsedTime = elapsedTimeRef.current

      root.append(background, buffer, ghost, progress, tooltip)

      function getMinValue() {
        return min !== undefined ? min : 0
      }

      function getMaxValue() {
        return max !== undefined ? max : playback.getDuration()
      }

      function mapPointerEventToOffset(evt: PointerEvent) {
        const { x: rootOffsetX, width: rootWidth } =
          root.getBoundingClientRect()
        return Math.max(0, Math.min(1, (evt.clientX - rootOffsetX) / rootWidth))
      }

      function mapOffsetToRelativeValue(offset: number) {
        const minValue = getMinValue()
        const maxValue = getMaxValue()
        const value = minValue + (maxValue - minValue) * offset
        return Math.max(minValue, Math.min(maxValue, value)) - minValue
      }

      function mapRelativeToAbsoluteValue(value: number) {
        return value + getMinValue()
      }

      function mapAbsoluteToRelativeValue(value: number) {
        return value - getMinValue()
      }

      function mapValueToOffset(value: number) {
        const minValue = getMinValue()
        const maxValue = getMaxValue()
        const offset = (value - minValue) / (maxValue - minValue)
        return isNaN(offset) ? 0 : Math.max(0, Math.min(1, offset))
      }

      // Direct events
      const pointerEnter$ = fromEvent<PointerEvent>(root, 'pointerenter')
      const pointerLeave$ = fromEvent<PointerEvent>(root, 'pointerleave')
      const pointerDown$ = fromEvent<PointerEvent>(root, 'pointerdown')

      // Indirect events
      const pointerMove$ = fromEvent<PointerEvent>(window, 'pointermove')
      const pointerUp$ = fromEvent<PointerEvent>(window, 'pointerup')

      subscription.add(
        pointerDown$
          .pipe(
            switchMap(() => pointerUp$.pipe(take(1))),
            map(mapPointerEventToOffset),
            map(mapOffsetToRelativeValue),
            map(mapRelativeToAbsoluteValue)
          )
          .subscribe(value => {
            playback.seekToTime(value)
            Analytics.track('playback:seek-to-time')
          })
      )

      subscription.add(
        pointerEnter$
          .pipe(
            switchMap(() => pointerMove$.pipe(takeUntil(pointerLeave$))),
            map(evt => {
              const offset = mapPointerEventToOffset(evt)
              const value = mapOffsetToRelativeValue(offset)
              return [offset, value] as const
            })
          )
          .subscribe(([offset, value]) => {
            updateBarOffset(ghost, offset)
            updateTooltip(tooltip, offset, `${formatTime(value, 'millis')}`)
            showTooltip(tooltip)
          })
      )

      subscription.add(
        pointerLeave$.subscribe(() => {
          updateBarOffset(ghost, 0)
          hideTooltip(tooltip)
        })
      )

      subscription.add(
        pointerDown$
          .pipe(
            switchMap(() => {
              const playing =
                playback.getPlaybackState() === PlaybackState.Playing
              return pointerUp$.pipe(
                map(() => playing),
                startWith(false),
                distinctUntilChanged()
              )
            })
          )
          .subscribe(playing => {
            if (playing) {
              playback.play()
            } else {
              playback.pause()
            }
          })
      )

      subscription.add(
        pointerDown$.pipe(map(mapPointerEventToOffset)).subscribe(offset => {
          updateBarOffset(progress, offset)
          updateElapsedTime(
            elapsedTime,
            formatTime(mapOffsetToRelativeValue(offset), 'seconds')
          )
        })
      )

      subscription.add(
        pointerDown$
          .pipe(
            switchMap(() => pointerMove$.pipe(takeUntil(pointerUp$))),
            map(mapPointerEventToOffset)
          )
          .subscribe(offset => {
            updateBarOffset(progress, offset)
            updateElapsedTime(
              elapsedTime,
              formatTime(mapOffsetToRelativeValue(offset), 'seconds')
            )
          })
      )

      subscription.add(
        combineLatest([playback.$playbackState, playback.$latestControlFrame])
          .pipe(
            switchMap(([playbackState]) => {
              const initialOffset = mapValueToOffset(
                Math.max(getMinValue(), playback.getElapsed())
              )

              const duration = Math.round(
                (1 - initialOffset) * (getMaxValue() - getMinValue())
              )

              return playbackState === PlaybackState.Playing
                ? createAnimationObservable(progress, initialOffset, duration)
                : NEVER
            })
          )
          .subscribe(animation => animation.play())
      )

      subscription.add(
        playback.$latestControlFrame
          .pipe(
            map(() => playback.getElapsed()),
            map(mapValueToOffset)
          )
          .subscribe(offset => updateBarOffset(progress, offset))
      )

      subscription.add(
        playback.$latestEventTime
          .pipe(map(mapValueToOffset))
          .subscribe(offset => {
            updateBarOffset(buffer, offset)
          })
      )

      subscription.add(
        playback.$elapsed
          .pipe(map(mapAbsoluteToRelativeValue))
          .subscribe(elapsed => {
            updateElapsedTime(elapsedTime, formatTime(elapsed, 'seconds'))
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
  }, [playback, elapsedTimeRef, progressRef, min, max])

  return (
    <Row alignItems="center" height="100%" gap={8}>
      <PlayAction />

      <Row alignItems="center" height="100%" width="100%" position="relative">
        <Block
          position="relative"
          width="100%"
          height={8}
          hoverHeight={12}
          transition="height 100ms linear"
          props={{ ref: progressRef }}
        />

        <Block
          position="absolute"
          top={0}
          left={0}
          right={0}
          height="100%"
          pointerEvents="none"
        >
          {children}
        </Block>
      </Row>

      <Row
        gap={3}
        alignItems="center"
        fontFamily="monospace"
        fontSize={13}
        userSelect="none"
      >
        <Block
          color={colors.blue['700']}
          whiteSpace="nowrap"
          props={{ ref: elapsedTimeRef }}
        >
          00:00
        </Block>
        <Block color={colors.slate['500']}>/</Block>
        <Block color={colors.blue['700']} whiteSpace="nowrap">
          {formatTime((max || playback.getDuration()) - (min || 0), 'seconds')}
        </Block>
      </Row>
    </Row>
  )
}

function createAnimationObservable(
  target: HTMLElement,
  initialOffset: number,
  duration: number
) {
  return new Observable<Animation>(observer => {
    const keyframes: Array<Keyframe> = [
      { transform: `scaleX(${initialOffset})` },
      { transform: `scaleX(1.0)` },
    ]

    const options: KeyframeEffectOptions = {
      duration,
      easing: 'linear',
      fill: 'forwards',
      iterations: 1,
    }

    const effect = new KeyframeEffect(target, keyframes, options)
    const animation = new Animation(effect)

    observer.next(animation)

    return () => {
      let currentTime = animation.currentTime ?? 0

      if (typeof currentTime !== 'number') {
        currentTime = currentTime.to('ms').value
      }

      const completed = currentTime / duration
      const finalOffset = initialOffset + (1 - initialOffset) * completed
      updateBarOffset(target, finalOffset)
      animation.cancel()
    }
  })
}

function createBackgroundElement() {
  const elem = document.createElement('div')

  const styles = [
    ['backgroundColor', colors.slate['100'] as string],
    ['cursor', 'pointer'],
    ['height', '100%'],
    ['pointerEvents', 'none'],
    ['position', 'relative'],
    ['width', '100%'],
  ] as const

  for (const [key, value] of styles) {
    elem.style[key] = value
  }

  return elem
}

function createBufferElement() {
  const elem = document.createElement('div')

  const styles = [
    ['backgroundColor', colors.blue['100'] as string],
    ['height', '100%'],
    ['left', '0'],
    ['pointerEvents', 'none'],
    ['position', 'absolute'],
    ['transform', 'scaleX(0)'],
    ['transformOrigin', '0 0'],
    ['top', '0'],
    ['width', '100%'],
  ] as const

  for (const [key, value] of styles) {
    elem.style[key] = value
  }

  return elem
}

function createProgressElement() {
  const elem = document.createElement('div')

  const styles = [
    ['backgroundColor', colors.blue['500'] as string],
    ['height', '100%'],
    ['left', '0'],
    ['pointerEvents', 'none'],
    ['position', 'absolute'],
    ['top', '0'],
    ['transform', 'scaleX(0)'],
    ['transformOrigin', '0 0'],
    ['width', '100%'],
  ] as const

  for (const [key, value] of styles) {
    elem.style[key] = value
  }

  return elem
}

function createGhostElement() {
  const elem = document.createElement('div')

  const styles = [
    ['backgroundColor', colors.blue['200'] as string],
    ['height', '100%'],
    ['left', '0'],
    ['pointerEvents', 'none'],
    ['position', 'absolute'],
    ['transform', 'scaleX(0)'],
    ['transformOrigin', '0 0'],
    ['top', '0'],
    ['width', '100%'],
  ] as const

  for (const [key, value] of styles) {
    elem.style[key] = value
  }

  return elem
}

function createTooltipElement() {
  const elem = document.createElement('div')

  const styles = [
    ['backgroundColor', colors.slate['700'] as string],
    ['color', colors.white],
    ['display', 'none'],
    ['fontSize', '11px'],
    ['left', '0'],
    ['padding', '8px'],
    ['position', 'absolute'],
    ['top', '0'],
    ['transform', 'translate(-50%, -125%)'],
    ['userSelect', 'none'],
    ['zIndex', `${2 ** 32 - 1}`],
  ] as const

  for (const [key, value] of styles) {
    elem.style[key] = value
  }

  return elem
}

function updateBarOffset(target: HTMLElement, offset: number) {
  target.style.transform = `scaleX(${offset})`
}

function updateTooltip(target: HTMLElement, offset: number, value: string) {
  target.style.left = `${offset * 100}%`
  target.textContent = value
}

function updateElapsedTime(target: HTMLElement, value: string) {
  target.textContent = value
}

function showTooltip(target: HTMLElement) {
  target.style.display = 'block'
}

function hideTooltip(target: HTMLElement) {
  target.style.display = 'none'
}
