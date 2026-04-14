import { Block, Grid } from '@jsxstyle/react'
import { Card, color, DefinitionList } from '@repro/design'
import { EventHighlights } from '@repro/devtools'
import { RecordingInfo } from '@repro/domain'
import { ucfirst } from '@repro/string-utils'
import React from 'react'
import { Summary } from './Summary'

interface Props {
  info: RecordingInfo
}

export const Sidebar: React.FC<Props> = ({ info }) => (
  <Card>
    <Grid
      gridTemplateRows="auto 1fr auto"
      height="100%"
      marginH={-20}
      overflow="hidden"
    >
      <Summary info={info} />

      <Block backgroundColor={color.bg.subtle}>
        <EventHighlights />
      </Block>

      <Grid
        isolation="isolate"
        paddingH={10}
        gridTemplateColumns="max-content 1fr"
        fontSize={13}
        backgroundColor={color.bg.surface}
        borderTop={`1px solid ${color.border.default}`}
        boxShadow={`0 -4px 16px ${color.bg.hover}`}
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
