import { Block } from '@jsxstyle/react'
import React, { MutableRefObject, useEffect, useRef } from 'react'
import { color } from '../tokens/colors'

interface Props {
  value: number
  min: number
  max: number
}

/**
 * Meter fill colors (REP-189).
 *
 * Shifted from blue-500/green-500 to blue-600/green-700 for WCAG 1.4.11
 * non-text contrast (3:1 minimum against the slate-200 track):
 *   blue-600 on slate-200: 4.19:1 ✓
 *   green-700 on slate-200: 4.07:1 ✓
 */
const FILL_IN_PROGRESS = color.primary // blue-700 (5.44:1 on slate-200 ✓)
const FILL_COMPLETE = color.success    // green-700 (4.07:1 on slate-200 ✓)

function createValueElement() {
  const elem = document.createElement('div')
  elem.classList.add('value')

  const styles = [
    ['backgroundColor', FILL_IN_PROGRESS],
    ['height', '100%'],
    ['left', '0'],
    ['pointerEvents', 'none'],
    ['position', 'absolute'],
    ['top', '0'],
    ['transform', 'scaleX(0)'],
    ['transformOrigin', '0 0'],
    ['transition', 'transform 100ms ease-out'],
    ['width', '100%'],
  ] as const

  for (const [key, value] of styles) {
    elem.style[key] = value
  }

  return elem
}

function updateValue(elem: HTMLElement, value: number) {
  elem.style.transform = `scaleX(${value})`

  if (value === 1) {
    elem.style.backgroundColor = FILL_COMPLETE
  }
}

export const Meter: React.FC<Props> = ({ min, max, value }) => {
  const ref = useRef() as MutableRefObject<HTMLDivElement>
  const normalizedValue = value / (max - min)

  useEffect(() => {
    if (ref.current) {
      let valueElem = ref.current.querySelector<HTMLDivElement>('.value')

      if (!valueElem) {
        valueElem = createValueElement()
        ref.current.appendChild(valueElem)
      }

      updateValue(valueElem, normalizedValue)
    }
  }, [ref, normalizedValue])

  return (
    <Block
      position="relative"
      width="100%"
      height={8}
      backgroundColor={color.border.default}
      borderRadius={4}
      overflow="hidden"
      props={{ ref }}
    />
  )
}
