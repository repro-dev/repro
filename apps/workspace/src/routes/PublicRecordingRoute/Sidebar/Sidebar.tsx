import { Card, colors, DefinitionList } from '@repro/design'
import { EventHighlights } from '@repro/devtools'
import { RecordingInfo } from '@repro/domain'
import { ucfirst } from '@repro/string-utils'
import { Block, Grid } from '@jsxstyle/react'
import React from 'react'
import { Summary } from './Summary'

interface Props {
  info: RecordingInfo
}

export const Sidebar: React.FC<Props> = ({ info }) => {
  return (
    <Card>
      <Grid
        gridTemplateRows="auto 1fr auto"
        height="100%"
        marginH={-20}
        overflow="hidden"
      >
        <Summary info={info} />

        <Block backgroundColor={colors.slate['50']}>
          <EventHighlights />
        </Block>

        <Grid
          isolation="isolate"
          paddingH={10}
          gridTemplateColumns="max-content 1fr"
          fontSize={13}
          backgroundColor={colors.white}
          borderTop={`1px solid ${colors.slate['200']}`}
          boxShadow={`0 -4px 16px ${colors.slate['100']}`}
        >
          <DefinitionList
            title="System Info"
            pairs={[
              [
                'Browser',
                info.browserName
                  ? `${ucfirst(info.browserName)} ${info.browserVersion}`
                  : null,
              ],
              ['OS', info.operatingSystem],
            ]}
          />
        </Grid>
      </Grid>
    </Card>
  )
}
