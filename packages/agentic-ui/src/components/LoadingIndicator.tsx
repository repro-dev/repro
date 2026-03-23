import { Block } from '@jsxstyle/react'
import { colors, FX } from '@repro/design'
import { Loading } from '@repro/agentic'
import { CircleIcon } from 'lucide-react'
import React from 'react'

interface LoadingIndicatorProps {
  loading: Loading
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  loading,
}) => {
  const isHidden = loading === 'none' || loading === 'cancelled'

  return (
    <Block
      backgroundColor={colors.blue['800']}
      backgroundImage={`linear-gradient(to bottom right, ${colors.blue['900']}, ${colors.blue['700']})`}
      borderRadius="99em"
      bottom={0}
      boxShadow={isHidden ? 'none' : '0 0 16px rgba(0, 0, 0, 0.15)'}
      left="50%"
      paddingBlock={10}
      paddingInline={15}
      position="absolute"
      translate={isHidden ? `-50% calc(100% + 20px)` : `-50% -20px`}
      transition="all ease-in-out 250ms"
    >
      <FX.Pulse>
        <CircleIcon size={8} fill={colors.white} stroke={colors.white} />
      </FX.Pulse>

      <FX.Pulse animationDelay="100ms">
        <CircleIcon size={8} fill={colors.white} stroke={colors.white} />
      </FX.Pulse>

      <FX.Pulse animationDelay="200ms">
        <CircleIcon size={8} fill={colors.white} stroke={colors.white} />
      </FX.Pulse>
    </Block>
  )
}
