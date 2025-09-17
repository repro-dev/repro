import { Card, colors } from '@repro/design'
import { Block, Col, Grid, Row } from '@jsxstyle/react'
import { AlertTriangle as AlertIcon } from 'lucide-react'
import React from 'react'

interface Props {
  error: Error
}

export const RecordingError: React.FC<Props> = ({ error }) => (
  <Grid
    height="calc(100vh - 90px)"
    gridTemplateColumns="1fr"
    gridTemplateRows="100%"
    marginH={-15}
    backgroundColor={colors.slate['50']}
  >
    <Row alignItems="center" justifyContent="center" height="100%">
      <Card>
        <Row gap={15}>
          <AlertIcon size={48} color={colors.slate['300']} />

          <Col gap={15}>
            <Block
              fontSize={18}
              fontWeight={700}
              color={
                error.name === 'ServerName'
                  ? colors.rose['700']
                  : colors.blue['700']
              }
            >
              {error.name === 'ServerError'
                ? 'Something went wrong'
                : 'Could not find recording'}
            </Block>

            <Block fontSize={15} color={colors.slate['700']}>
              {error.name === 'ServerError'
                ? 'There was an error loading this recording. Please try again.'
                : 'This recording does not exist.'}
            </Block>
          </Col>
        </Row>
      </Card>
    </Row>
  </Grid>
)
