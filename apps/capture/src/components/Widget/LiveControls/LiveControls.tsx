import { Block, Grid, Inline, Row } from '@jsxstyle/react'
import { Button, color, fontSize, lineHeight, spacing } from '@repro/design'
import { interrupt } from '@repro/recording'
import { Check as CheckIcon, Video as VideoIcon } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { interval } from 'rxjs'
import { ReadyState, useReadyState } from '~/state'
export const LiveControls: React.FC = () => {
  const [, setReadyState] = useReadyState()
  const [time, setTime] = useState(0)

  useEffect(() => {
    const subscription = interval(1000).subscribe(() =>
      setTime(time => time + 1)
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [setTime])

  function onDone() {
    interrupt()
    setReadyState(ReadyState.Ready)
  }

  const minutes = (time / 60) | 0
  const seconds = time - minutes * 60

  return (
    <Grid
      position="absolute"
      top={0}
      right={0}
      height={60}
      transform="translate(calc(100% + 15px), -20px)"
      alignItems="center"
      gridTemplateColumns="1fr auto auto"
      gap={spacing.lg}
      backgroundColor={color.bg.surface}
      borderColor={color.infoFg}
      borderStyle="solid"
      borderWidth="1px 1px 1px 0"
      borderRadius="0 2px 2px 0"
    >
      <Button onClick={onDone}>
        <CheckIcon size={16} />
      </Button>

      <Row alignItems="center" gap={spacing.md} lineHeight={lineHeight.tight}>
        <Row
          alignItems="center"
          justifyContent="center"
          width={30}
          height={30}
          backgroundColor={color.primarySubtle}
          borderRadius="99rem"
        >
          <VideoIcon color={color.primary} size={16} />
        </Row>

        <Block
          fontFamily="monospace"
          fontSize={fontSize.sm}
          color={color.text.default}
        >
          <Inline>{minutes.toString().padStart(2, '0')}</Inline>
          <Inline color={color.border.focus}>:</Inline>
          <Inline>{seconds.toString().padStart(2, '0')}</Inline>
        </Block>
      </Row>
    </Grid>
  )
}
