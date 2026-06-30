import { Grid, Row } from '@jsxstyle/react'
import { spacing } from '@repro/design'
import React from 'react'
import { PlaybackCanvas, PlaybackHudProvider } from '../PlaybackCanvas'
import {
  ErrorMarkerFilterToggle,
  useErrorAndWarningMarkers,
} from '../PlaybackTimeline/ErrorMarkers'
import { RangeTimeline } from '../PlaybackTimeline/RangeTimeline'

export const PlaybackEditor: React.FC = () => {
  const {
    errorAndWarningEvents,
    filter,
    setFilter,
    allEventsCount,
    errorEventsCount,
  } = useErrorAndWarningMarkers()

  return (
    <PlaybackHudProvider>
      <Grid gridTemplateRows="1fr auto">
        <PlaybackCanvas
          scaling="scale-to-fit"
          interactive={false}
          trackScroll={true}
          trackPointer={true}
        />

        <Row
          alignItems="center"
          gap={spacing.md}
          padding={`0 ${spacing.md}px`}
          height="100%"
        >
          <RangeTimeline errorAndWarningEvents={errorAndWarningEvents} />
          <ErrorMarkerFilterToggle
            filter={filter}
            onChange={setFilter}
            totalCount={allEventsCount}
            errorCount={errorEventsCount}
          />
        </Row>
      </Grid>
    </PlaybackHudProvider>
  )
}
