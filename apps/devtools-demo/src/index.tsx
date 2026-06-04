import { Block, Grid, Row } from '@jsxstyle/react'
import { Card, color, colors, Logo } from '@repro/design'
import { DevTools } from '@repro/devtools'
import { Stats } from '@repro/diagnostics'
import { applyResetStyles } from '@repro/theme'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { RecordingLoader } from './RecordingLoader'

Stats.enable()

const rootSelector = '#root'
const rootElem = document.querySelector(rootSelector)
const rootStyleSheet = document.querySelector<HTMLStyleElement>('#root-styles')

if (rootStyleSheet) {
  applyResetStyles(rootSelector, rootStyleSheet)
}

if (rootElem) {
  const root = createRoot(rootElem)

  root.render(
    <Grid
      height="100vh"
      gridTemplateRows="auto 1fr"
      backgroundColor={colors.white}
    >
      <Block
        padding={20}
        height={120}
        backgroundColor={color.border.focus}
        backgroundImage={`linear-gradient(to bottom right, ${color.infoFg}, ${color.primary})`}
      >
        <Row alignItems="center">
          <Logo size={30} inverted={true} />
        </Row>
      </Block>

      <Block marginTop={-60} padding={15}>
        <RecordingLoader>
          <Grid gap={15} height="calc(100vh - 90px)" gridTemplateRows="100%">
            <Card fullBleed height="100%">
              <Block height="100%" overflow="hidden" borderRadius={4}>
                <DevTools />
              </Block>
            </Card>
          </Grid>
        </RecordingLoader>
      </Block>
    </Grid>
  )
}
