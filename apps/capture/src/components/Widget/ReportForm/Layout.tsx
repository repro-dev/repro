import { Grid } from '@jsxstyle/react'
import { Card, color, shadow } from '@repro/design'
import React from 'react'
import { MAX_INT32 } from '~/constants'

export const Layout: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <Grid
    gridTemplateColumns="1fr 420px"
    gridTemplateRows="100%"
    gridTemplateAreas="'playback aside'"
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

export const PlaybackRegion: React.FC<React.PropsWithChildren<{}>> = ({
  children,
}) => (
  <Grid
    gridArea="playback"
    gridTemplateRows="auto 1fr auto"
    height="100%"
    overflow="hidden"
    isolation="isolate"
    backgroundColor={color.bg.surface}
    borderRadius={4}
    boxShadow={shadow.md}
  >
    {children}
  </Grid>
)

export const AsideRegion: React.FC<React.PropsWithChildren<{}>> = ({
  children,
}) => (
  <Grid
    gridArea="aside"
    alignItems="stretch"
    maxBlockSize="100%"
    overflow="clip"
    overflowClipMargin={16}
  >
    <Card height="100%">{children}</Card>
  </Grid>
)
