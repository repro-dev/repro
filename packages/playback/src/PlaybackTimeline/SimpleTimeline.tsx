import { Block, Row } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { formatTime } from '@repro/date-utils'
import { color, fontSize, spacing } from '@repro/design'
import type { ErrorOrWarningEntry } from '@repro/source-utils'
import React, { useEffect, useRef } from 'react'
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
import { PlaybackKeyboardShortcuts } from './PlaybackKeyboardShortcuts'
import { SpeedControl } from './SpeedControl'

const SVG_NS = 'http://www.w3.org/2000/svg'

function createErrorIcon(size: number, fillColor: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', `${size}`)
  svg.setAttribute('height', `${size}`)
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')

  const circle = document.createElementNS(SVG_NS, 'circle')
  circle.setAttribute('cx', '8')
  circle.setAttribute('cy', '8')
  circle.setAttribute('r', '7')
  circle.setAttribute('fill', fillColor)

  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', 'M5.5 5.5l5 5M10.5 5.5l-5 5')
  path.setAttribute('stroke', '#fff')
  path.setAttribute('stroke-width', '1.5')
  path.setAttribute('stroke-linecap', 'round')

  svg.appendChild(circle)
  svg.appendChild(path)
  return svg
}

function createWarningIcon(size: number, fillColor: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', `${size}`)
  svg.setAttribute('height', `${size}`)
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')

  const triangle = document.createElementNS(SVG_NS, 'path')
  triangle.setAttribute('d', 'M8 2L1 14h14L8 2z')
  triangle.setAttribute('fill', fillColor)
  triangle.setAttribute('stroke', fillColor)
  triangle.setAttribute('stroke-width', '0.5')
  triangle.setAttribute('stroke-linejoin', 'round')

  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', '8')
  line.setAttribute('y1', '6')
  line.setAttribute('x2', '8')
  line.setAttribute('y2', '10')
  line.setAttribute('stroke', '#fff')
  line.setAttribute('stroke-width', '1.5')
  line.setAttribute('stroke-linecap', 'round')

  const dot = document.createElementNS(SVG_NS, 'circle')
  dot.setAttribute('cx', '8')
  dot.setAttribute('cy', '12.5')
  dot.setAttribute('r', '0.75')
  dot.setAttribute('fill', '#fff')

  svg.appendChild(triangle)
  svg.appendChild(line)
  svg.appendChild(dot)
  return svg
}

export interface Props {
  children?: React.ReactNode
  min?: number
  max?: number
  errorAndWarningEvents?: Array<ErrorOrWarningEntry>
  onMarkerClick?: (entry: ErrorOrWarningEntry) => void
}

export const SimpleTimeline: React.FC<Props> = ({
  children,
  min,
  max,
  errorAndWarningEvents,
  onMarkerClick,
}) => {
  const progressRef = useRef<HTMLDivElement | null>(null)
  const elapsedTimeRef = useRef<HTMLDivElement | null>(null)
  const markerTooltipRef = useRef<string | null>(null)
  const onMarkerClickRef = useRef(onMarkerClick)
  onMarkerClickRef.current = onMarkerClick
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
          root!.getBoundingClientRect()
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
      const pointerEnter$ = fromEvent(root, 'pointerenter')
      const pointerLeave$ = fromEvent(root, 'pointerleave')
      const pointerDown$ = fromEvent(root, 'pointerdown')

      // Indirect events
      const pointerMove$ = fromEvent(window, 'pointermove')
      const pointerUp$ = fromEvent(window, 'pointerup')

      subscription.add(
        pointerDown$
          .pipe(
            switchMap(() => pointerUp$.pipe(take(1))),
            map(evt => mapPointerEventToOffset(evt as PointerEvent)),
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
              const offset = mapPointerEventToOffset(evt as PointerEvent)
              const value = mapOffsetToRelativeValue(offset)
              return [offset, value] as const
            })
          )
          .subscribe(([offset, value]) => {
            updateBarOffset(ghost, offset)
            const markerText = markerTooltipRef.current
            updateTooltip(
              tooltip,
              offset,
              markerText ?? `${formatTime(value, 'millis')}`
            )
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
        pointerDown$
          .pipe(map(evt => mapPointerEventToOffset(evt as PointerEvent)))
          .subscribe(offset => {
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
            map(evt => mapPointerEventToOffset(evt as PointerEvent))
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
        combineLatest([
          playback.$playbackState,
          playback.$latestControlFrame,
          playback.$speed,
        ])
          .pipe(
            switchMap(([playbackState]) => {
              const initialOffset = mapValueToOffset(
                Math.max(getMinValue(), playback.getElapsed())
              )

              // Divide by current speed so the CSS animation finishes in the
              // same wall-clock time as the actual playback at this speed.
              const duration = Math.round(
                ((1 - initialOffset) * (getMaxValue() - getMinValue())) /
                  playback.getSpeed()
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

      // Render error/warning markers
      if (errorAndWarningEvents && errorAndWarningEvents.length > 0) {
        const markersContainer = document.createElement('div')
        const iconSize = 16

        const containerStyles = [
          ['height', '100%'],
          ['left', '0'],
          ['pointerEvents', 'none'],
          ['position', 'absolute' as const],
          ['top', '0'],
          ['width', '100%'],
          ['zIndex', '10'],
        ] as const

        for (const [key, value] of containerStyles) {
          markersContainer.style[key] = value
        }

        for (const entry of errorAndWarningEvents) {
          const offset = mapValueToOffset(entry.time)
          // Only render markers within the visible range
          if (offset < 0 || offset > 1) continue

          const isError = entry.severity === 'error'
          const markerColor = isError
            ? (color.danger as string)
            : (color.warning as string)

          const compositeTooltip = [
            `<div style="${composeStyles([
              ['font-variant-numeric', 'tabular-nums'],
              ['opacity', '.8'],
              ['margin-bottom', `${spacing.sm}px`],
            ])}">${formatTime(entry.time, 'millis')}</div>`,
            `<div style="${composeStyles([['line-height', '1.35']])}">${
              entry.summary
            }</div>`,
          ].join(
            `<div style="${composeStyles([
              ['height', '0'],
              ['margin', `${spacing.sm}px -${spacing.md}px`],
              ['border-top', '1px solid currentColor'],
              ['opacity', '.15'],
            ])}"></div>`
          )

          const marker = document.createElement('div')
          marker.style.position = 'absolute'
          marker.style.left = `${offset * 100}%`
          marker.style.top = '50%'
          marker.style.transform = 'translate(-50%, -50%)'
          marker.style.width = `${iconSize}px`
          marker.style.height = `${iconSize}px`
          marker.style.cursor = 'pointer'
          marker.style.pointerEvents = 'auto'
          marker.style.display = 'flex'
          marker.style.alignItems = 'center'
          marker.style.justifyContent = 'center'

          marker.appendChild(
            isError
              ? createErrorIcon(iconSize, markerColor)
              : createWarningIcon(iconSize, markerColor)
          )

          marker.addEventListener('pointerenter', () => {
            markerTooltipRef.current = compositeTooltip
          })

          marker.addEventListener('pointerleave', () => {
            markerTooltipRef.current = null
          })

          marker.addEventListener('pointerdown', (e: PointerEvent) => {
            e.stopPropagation()
            playback.seekToTime(entry.time)
            onMarkerClickRef.current?.(entry)
            Analytics.track('playback:seek-to-marker')
          })

          markersContainer.appendChild(marker)
        }

        root.appendChild(markersContainer)
      }
    }

    return () => {
      subscription.unsubscribe()

      if (root) {
        while (root.firstChild) {
          root.firstChild.remove()
        }
      }
    }
  }, [playback, elapsedTimeRef, progressRef, min, max, errorAndWarningEvents])

  return (
    <Row alignItems="center" height="100%" gap={spacing.md}>
      <PlayAction />
      <SpeedControl />
      <PlaybackKeyboardShortcuts />

      <Row alignItems="center" height="100%" width="100%" position="relative">
        <Block
          position="relative"
          width="100%"
          height={8}
          hoverHeight={12}
          transition="height 100ms ease-in-out"
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
        gap={spacing.xs}
        alignItems="center"
        fontFamily="monospace"
        fontSize={fontSize.xs}
        userSelect="none"
      >
        <Block
          color={color.primary}
          whiteSpace="nowrap"
          props={{ ref: elapsedTimeRef }}
        >
          00:00
        </Block>
        <Block color={color.text.muted}>/</Block>
        <Block color={color.primary} whiteSpace="nowrap" fontSize={fontSize.xs}>
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
    ['backgroundColor', color.bg.hover as string],
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
    ['backgroundColor', color.primarySubtle as string],
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
    ['backgroundColor', color.border.focus as string],
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
    ['backgroundColor', color.primarySubtleHover as string],
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
    ['backgroundColor', color.text.secondary as string],
    ['borderRadius', '8px'],
    ['color', color.text.inverse],
    ['display', 'none'],
    ['fontSize', `${fontSize.xs}px`],
    ['left', '0'],
    ['maxWidth', '280px'],
    ['minWidth', '140px'],
    ['padding', `${spacing.md}px`],
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
  target.innerHTML = value
  target.style.whiteSpace = 'normal'
}

function updateElapsedTime(target: HTMLElement | null, value: string) {
  if (target) {
    target.textContent = value
  }
}

function showTooltip(target: HTMLElement) {
  target.style.display = 'block'
}

function hideTooltip(target: HTMLElement) {
  target.style.display = 'none'
}

function composeStyles(styles: readonly (readonly [string, string])[]) {
  return styles.map(([k, v]) => `${k}:${v}`).join(';')
}
/* eslint-enable */
