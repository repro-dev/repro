import { Grid } from '@jsxstyle/react'
import { FullPageLoading } from '@repro/design'
import React from 'react'

export const Loading: React.FC = () => (
  <Grid height="calc(100vh - 90px)">
    <FullPageLoading />
  </Grid>
)
