import './tailwind.css'
import { Analytics } from '@repro/analytics'
import { createMixpanelBrowserConsumer } from '@repro/analytics-provider-mixpanel'
import { ApiProvider, createApiClient } from '@repro/api-client'
import { AuthProvider, GateProvider, SessionRouteBoundary } from '@repro/auth'
import { defaultTheme, PortalRootProvider, ThemeProvider } from '@repro/design'
import { Stats } from '@repro/diagnostics'
import { getDefaultAgent } from '@repro/messaging'
import { applyResetStyles } from '@repro/theme'
import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Loading } from './components/Loading'
import { Env } from './config/createEnv'
import { defaultEnv as env } from './config/env'
import { Layout } from './Layout'

const HomeRoute = lazy(() => import('./routes/HomeRoute'))
const LoginRoute = lazy(() => import('./routes/LoginRoute'))
const RecordingRoute = lazy(() => import('./routes/RecordingRoute'))
const RegisterRoute = lazy(() => import('./routes/RegisterRoute'))

declare global {
  interface Window {
    __REPRO_ENV: Env
    __REPRO_USING_SDK: boolean
  }
}

window.__REPRO_USING_SDK = true

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
        <GateProvider>
          <AuthProvider>
            <ThemeProvider theme={defaultTheme}>
              <PortalRootProvider>
                <Suspense fallback={<Loading />}>
                  <Routes>
                    <Route element={<AuthLayout />}>
                      <Route path="account/login" element={<LoginRoute />} />
                      <Route
                        path="account/register"
                        element={<RegisterRoute />}
                      />
                      <Route path="account/verify" element={<div />} />
                    </Route>

                    <Route element={<Layout />}>
                      <Route element={<SessionRouteBoundary />}>
                        <Route index element={<HomeRoute />} />
                      </Route>
                    </Route>

                    <Route element={<SessionRouteBoundary />}>
                      <Route
                        path="projects/:projectId/recordings/:recordingId"
                        element={<RecordingRoute />}
                      />
                    </Route>
                  </Routes>
                </Suspense>
              </PortalRootProvider>
            </ThemeProvider>
          </AuthProvider>
        </GateProvider>
      </ApiProvider>
    </BrowserRouter>
  )
}
