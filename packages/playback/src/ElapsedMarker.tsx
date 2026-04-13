import { Block } from '@jsxstyle/react'
import { color } from '@repro/design'
import React, { useEffect, useState } from 'react'
import { Subscription } from 'rxjs'
import { usePlayback } from './hooks'

interface Props {
  prevIndex: number
  nextIndex: number
}

export const ElapsedMarker: React.FC = ({ prevIndex, nextIndex }) => {
  const playback = usePlayback()
  const [active, setActive] = useState(false)

  useEffect(() => {
    const subscription = new Subscription()

    subscription.add(
      playback.$activeIndex.subscribe(activeIndex => {
        setActive(activeIndex >= prevIndex && activeIndex < nextIndex)
      })
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [nextIndex, prevIndex, playback, setActive])

  return (
    <Block position="relative">
      <Block
        height={4}
        backgroundColor={color.bg.hover}
        borderColor={active ? color.border.focus : color.bg.hover}
        borderStyle="solid"
        borderWidth="1px 0 0"
      />
      {active && prevIndex !== -1 && (
        <Block
          position="absolute"
          left={0}
          bottom={4}
          width={0}
          height={0}
          borderColor={`transparent transparent ${color.border.focus} ${color.border.focus}`}
          borderStyle="solid"
          borderWidth={4}
        />
      )}
    </Block>
  )
}
