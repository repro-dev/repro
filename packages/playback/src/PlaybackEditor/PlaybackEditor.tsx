import { Grid } from '@jsxstyle/react'
import React from 'react'
import { PlaybackCanvas, PlaybackHudProvider } from '../PlaybackCanvas'
import { RangeTimeline } from '../PlaybackTimeline/RangeTimeline'

export const PlaybackEditor: React.FC = () => {
  return (
    <PlaybackHudProvider>
      <Grid gridTemplateRows="1fr auto">
        <PlaybackCanvas
          scaling="scale-to-fit"
          interactive={false}
          trackScroll={true}
          trackPointer={true}
        />

        <RangeTimeline />
      </Grid>
    </PlaybackHudProvider>
  )
}
