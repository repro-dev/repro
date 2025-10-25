import { Block } from '@jsxstyle/react'
import React, { MutableRefObject, useEffect, useRef } from 'react'
import { colors } from '../theme'

interface Props {
  value: number
  min: number
  max: number
}

function createValueElement() {
  const elem = document.createElement('div')
  elem.classList.add('value')

  const styles = [
    ['backgroundColor', colors.blue['500'] as string],
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
    elem.style.backgroundColor = colors.green['500']
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
      backgroundColor={colors.slate['200']}
      borderRadius={4}
      overflow="hidden"
      props={{ ref }}
    />
  )
}
