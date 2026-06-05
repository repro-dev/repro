import { Block } from '@jsxstyle/react'
import { Loading } from '@repro/agentic'
import { color } from '@repro/design'
import { ArrowDownIcon } from 'lucide-react'
import React from 'react'
import {
  GUTTER_PX,
  INPUT_CONTAINER_OFFSET_PX,
  LOADING_CONTAINER_OFFSET_PX,
} from '../constants'

interface JumpToEndButtonProps {
  shouldShow: boolean
  loading: Loading
  onJumpToEnd: () => void
}

export const JumpToEndButton: React.FC<JumpToEndButtonProps> = ({
  shouldShow,
  loading,
  onJumpToEnd,
}) => {
  return (
    <Block
      position="absolute"
      bottom={0}
      left="50%"
      translate={
        loading === 'none'
          ? `-50% -${INPUT_CONTAINER_OFFSET_PX + GUTTER_PX}px`
          : `-50% -${LOADING_CONTAINER_OFFSET_PX}px`
      }
      backgroundColor={color.text.default}
      backgroundImage={`linear-gradient(to bottom right, ${color.text.default}, ${color.text.secondary})`}
      boxShadow="0 0 16px rgba(0, 0, 0, 0.15)"
      color={color.text.inverse}
      padding={10}
      borderRadius="99rem"
      cursor="pointer"
      lineHeight={0}
      scale={shouldShow ? 1 : 0}
      transformOrigin="center center"
      transition="scale ease-in-out 100ms, translate ease-in-out 250ms"
      pointerEvents={shouldShow ? 'auto' : 'none'}
      onClick={onJumpToEnd}
    >
      <ArrowDownIcon size={16} />
    </Block>
  )
}
