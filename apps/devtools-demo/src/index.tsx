import { Block, Grid, Row } from '@jsxstyle/react'
import { Card, color, Logo, PortalRootProvider, spacing } from '@repro/design'
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
      backgroundColor={color.bg.surface}
    >
      <Block
        padding={spacing['2xl']}
        height={120}
        backgroundColor={color.border.focus}
        backgroundImage={`linear-gradient(to bottom right, ${color.infoFg}, ${color.primary})`}
      >
        <Row alignItems="center">
          <Logo size={30} inverted={true} />
        </Row>
      </Block>

      <Block marginTop={-(spacing['4xl'] + spacing.lg)} padding={spacing.xl}>
        <PortalRootProvider>
          <RecordingLoader>
            <Grid
              gap={spacing.xl}
              height="calc(100vh - 90px)"
              gridTemplateRows="100%"
            >
              <Card fullBleed height="100%">
                <Block height="100%" overflow="hidden" borderRadius={4}>
                  <DevTools />
                </Block>
              </Card>
            </Grid>
          </RecordingLoader>
        </PortalRootProvider>
      </Block>
    </Grid>
  )
}
