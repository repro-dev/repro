import { Grid } from '@jsxstyle/react'
import React from 'react'
import { PlaybackCanvas } from '../PlaybackCanvas'
import { RangeTimeline } from '../PlaybackTimeline/RangeTimeline'
import { WebSocketPanel } from '../WebSocketPanel'

export const PlaybackEditor: React.FC = () => {
  return (
    <Grid gridTemplateRows="1fr auto auto">
      <PlaybackCanvas
        scaling="scale-to-fit"
        interactive={false}
        trackScroll={true}
        trackPointer={true}
      />

      <RangeTimeline />

      <WebSocketPanel />
    </Grid>
  )
}
