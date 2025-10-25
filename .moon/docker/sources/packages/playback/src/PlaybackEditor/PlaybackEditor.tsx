import { Grid } from '@jsxstyle/react'
import React from 'react'
import { PlaybackCanvas } from '../PlaybackCanvas'
import { RangeTimeline } from '../PlaybackTimeline/RangeTimeline'

export const PlaybackEditor: React.FC = () => {
  return (
    <Grid gridTemplateRows="1fr auto">
      <PlaybackCanvas
        scaling="scale-to-fit"
        interactive={false}
        trackScroll={true}
        trackPointer={true}
      />

      <RangeTimeline />
    </Grid>
  )
}
