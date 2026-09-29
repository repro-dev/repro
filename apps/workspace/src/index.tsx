import { Analytics } from '@repro/analytics'
import { createMixpanelBrowserConsumer } from '@repro/analytics-provider-mixpanel'
import { ApiProvider, createApiClient } from '@repro/api-client'
import { AuthProvider, GateProvider } from '@repro/auth'
import { BillingProvider } from '@repro/billing'
import {
  ConfirmDialogProvider,
  PortalRootProvider,
  ThemeProvider,
} from '@repro/design'
import { Stats } from '@repro/diagnostics'
import { getDefaultAgent } from '@repro/messaging'
import { applyResetStyles } from '@repro/theme'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './AppRoutes'
import { Env } from './config/createEnv'
import { defaultEnv as env } from './config/env'

declare global {
  interface Window {
    __REPRO_ENV: Env
  }
}

if (env.BUILD_ENV === 'development') {
  Stats.enable()
}

const apiClient = createApiClient({
  baseUrl: env.REPRO_API_URL,
  authStorage: 'memory',
})

Analytics.setAgent(getDefaultAgent())
Analytics.registerConsumer(
  createMixpanelBrowserConsumer(
    env.MIXPANEL_TOKEN,
    env.BUILD_ENV === 'development'
  )
)

const rootSelector = '#root'
const rootElem = document.querySelector(rootSelector)
const rootStyleSheet = document.querySelector<HTMLStyleElement>('#root-styles')

if (rootStyleSheet) {
  applyResetStyles(rootSelector, rootStyleSheet)
}

if (rootElem) {
  const root = createRoot(rootElem)

  const basename = env.REPRO_APP_URL
    ? new URL(env.REPRO_APP_URL).pathname
    : undefined

  root.render(
    <BrowserRouter basename={basename}>
      <ApiProvider client={apiClient}>
        <BillingProvider
          config={{
            token: env.PADDLE_CLIENT_TOKEN,
            environment: env.PADDLE_ENVIRONMENT,
          }}
        >
          <GateProvider>
            <AuthProvider>
              <ThemeProvider>
                <PortalRootProvider>
                  <ConfirmDialogProvider>
                    <AppRoutes />
                  </ConfirmDialogProvider>
                </PortalRootProvider>
              </ThemeProvider>
            </AuthProvider>
          </GateProvider>
        </BillingProvider>
      </ApiProvider>
    </BrowserRouter>
  )
}
