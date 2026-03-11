import { Grid } from '@jsxstyle/react'
import { FX } from '@repro/design'
import { Loader as LoaderIcon } from 'lucide-react'
import React from 'react'

// TODO: Add full-screen loading interstitial to @repro/design
export const Loading: React.FC = () => (
  <Grid height="100%" alignItems="center" justifyItems="center">
    <FX.Spin>
      <LoaderIcon />
    </FX.Spin>
  </Grid>
)
