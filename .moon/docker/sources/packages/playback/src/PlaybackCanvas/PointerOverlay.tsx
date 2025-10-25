import { Block } from '@jsxstyle/react'
import { colors, Cursor } from '@repro/design'
import { PointerState } from '@repro/domain'
import React from 'react'
import { usePointer, usePointerState } from '../hooks'

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
