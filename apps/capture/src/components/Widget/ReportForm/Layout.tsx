import { Grid } from '@jsxstyle/react'
import { Card, colors } from '@repro/design'
import React, { PropsWithChildren } from 'react'
import { MAX_INT32 } from '~/constants'

export const Layout: React.FC<PropsWithChildren> = ({ children }) => (
  <Grid
    gridTemplateColumns="1fr 420px"
    gridTemplateAreas="'playback details'"
    gap={10}
    position="relative"
    height="100%"
    width="100%"
    zIndex={MAX_INT32}
    pointerEvents="auto"
  >
    {children}
  </Grid>
)

export const PlaybackRegion: React.FC<PropsWithChildren> = ({ children }) => (
  <Grid
    gridArea="playback"
    gridTemplateRows="auto 1fr auto"
    height="100%"
    overflow="hidden"
    isolation="isolate"
    backgroundColor={colors.white}
    borderRadius={4}
    boxShadow={`
      0 4px 16px rgba(0, 0, 0, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.1)
    `}
  >
    {children}
  </Grid>
)

export const DetailsRegion: React.FC<PropsWithChildren> = ({ children }) => (
  <Grid gridArea="details" alignItems="stretch">
    <Card>{children}</Card>
  </Grid>
)
