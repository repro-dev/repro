import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { PointerState } from '@repro/domain'
import React from 'react'
import { usePointer, usePointerState } from '../hooks'

const Cursor: React.FC<{ color?: string; size?: number }> = ({
  color,
  size = 24,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 12 20"
    width={size}
    height={size}
  >
    <path
      d="M0.199997 16.9V0.900024L11.8 12.5H5L4.6 12.6L0.199997 16.9Z"
      fill={colors.white}
    />
    <path d="M9.3 17.6L5.7 19.1L1 8L4.7 6.5L9.3 17.6Z" fill={colors.white} />
    <path
      d="M4.8745 9.51852L3.0303 10.2927L6.1271 17.6695L7.9713 16.8953L4.8745 9.51852Z"
      fill={color}
    />
    <path
      d="M1.2 3.29999V14.5L4.2 11.6L4.6 11.5H9.4L1.2 3.29999Z"
      fill={color}
    />
  </svg>
)

export const PointerOverlay: React.FC = () => {
  const [x, y] = usePointer()
  const pointerState = usePointerState()

  return (
    <Block
      position="absolute"
      top={0}
      left={0}
      bottom={0}
      right={0}
      overflow="hidden"
      pointerEvents="none"
    >
      <Block
        position="absolute"
        transformOrigin="0 0"
        props={{
          style: {
            transform: `translate(${x}px, ${y}px)`,
          },
        }}
      >
        <Block
          position="absolute"
          top={0}
          left={0}
          width={30}
          height={30}
          backgroundColor={colors.pink['200']}
          borderRadius={30}
          opacity={pointerState === PointerState.Up ? 0 : 0.75}
          transform="translate(-10px, -10px)"
          transition="opacity 100ms linear"
        />

        <Block isolation="isolate">
          <Cursor color={colors.pink['700']} />
        </Block>
      </Block>
    </Block>
  )
}
