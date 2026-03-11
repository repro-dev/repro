import { Grid } from '@jsxstyle/react'
import { FullPageError } from '@repro/design'
import React from 'react'

interface Props {
  error: Error
}

export const RecordingError: React.FC<Props> = ({ error }) => (
  <Grid height="100%">
    <FullPageError
      title={
        error.name === 'ServerError'
          ? 'Something went wrong'
          : 'Could not find recording'
      }
      description={
        error.name === 'ServerError'
          ? 'There was an error loading this recording. Please try again.'
          : 'This recording does not exist.'
      }
    />
  </Grid>
)
