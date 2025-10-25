import { FX } from '@repro/design'
import { Grid } from '@jsxstyle/react'
import { Loader as LoaderIcon } from 'lucide-react'
import React from 'react'

export const Loading: React.FC = () => (
  <Grid height="calc(100vh - 90px)" alignItems="center" justifyItems="center">
    <FX.Spin>
      <LoaderIcon />
    </FX.Spin>
  </Grid>
)
