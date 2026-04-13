import { Analytics } from '@repro/analytics'
import { createMixpanelBrowserConsumer } from '@repro/analytics-provider-mixpanel'
import { ApiProvider, createApiClient } from '@repro/api-client'
import { AuthProvider, GateProvider, SessionRouteBoundary } from '@repro/auth'
import {
  ConfirmDialogProvider,
  defaultTheme,
  PortalRootProvider,
  ThemeProvider,
} from '@repro/design'
import { Stats } from '@repro/diagnostics'
import { getDefaultAgent } from '@repro/messaging'
import { applyResetStyles } from '@repro/theme'
import * as Sentry from '@sentry/react'
import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Loading } from './components/Loading'
import { Env } from './config/createEnv'
import { defaultEnv as env } from './config/env'
import { Layout } from './Layout'
import { SettingsLayout } from './SettingsLayout'

const HomeRoute = lazy(() => import('./routes/HomeRoute'))
const LoginRoute = lazy(() => import('./routes/LoginRoute'))
const AcceptInvitationRoute = lazy(
  () => import('./routes/AcceptInvitationRoute')
)
const PricingRoute = lazy(() => import('./routes/PricingRoute'))
const ProjectSettingsRoute = lazy(() => import('./routes/ProjectSettingsRoute'))
const ProjectsRoute = lazy(() => import('./routes/ProjectsRoute'))
const RecordingRoute = lazy(() => import('./routes/RecordingRoute'))
const RegisterRoute = lazy(() => import('./routes/RegisterRoute'))
const ResetPasswordRoute = lazy(() => import('./routes/ResetPasswordRoute'))
const SettingsRoute = lazy(() => import('./routes/SettingsRoute'))

declare global {
  interface Window {
    __REPRO_ENV: Env
  }
}

if (env.BUILD_ENV === 'development') {
  Stats.enable()
}

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.BUILD_ENV,
    tracesSampleRate: 0,
  })
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
                <ConfirmDialogProvider>
                  <Suspense fallback={<Loading />}>
                    <Routes>
                      <Route element={<AuthLayout />}>
                        <Route path="account/login" element={<LoginRoute />} />
                        <Route
                          path="account/register"
                          element={<RegisterRoute />}
                        />
                        <Route path="account/verify" element={<div />} />
                        <Route
                          path="account/reset-password/:token"
                          element={<ResetPasswordRoute />}
                        />
                        <Route
                          path="account/accept-invitation"
                          element={<AcceptInvitationRoute />}
                        />
                      </Route>

                      <Route element={<Layout />}>
                        <Route element={<SessionRouteBoundary />}>
                          <Route index element={<HomeRoute />} />
                          <Route path="projects" element={<ProjectsRoute />} />
                          <Route path="pricing" element={<PricingRoute />} />
                          <Route
                            path="account/api-keys"
                            element={
                              <Navigate to="/settings/api-keys" replace />
                            }
                          />
                        </Route>
                      </Route>

                      <Route element={<SessionRouteBoundary />}>
                        <Route element={<SettingsLayout />}>
                          <Route
                            path="settings/*"
                            element={<SettingsRoute />}
                          />
                        </Route>
                      </Route>

                      <Route element={<SessionRouteBoundary />}>
                        <Route
                          path="projects/:projectId/recordings/:recordingId"
                          element={<RecordingRoute />}
                        />
                      </Route>

                      <Route element={<Layout />}>
                        <Route element={<SessionRouteBoundary />}>
                          <Route
                            path="projects/:projectId/settings"
                            element={<ProjectSettingsRoute />}
                          />
                        </Route>
                      </Route>
                    </Routes>
                  </Suspense>
                </ConfirmDialogProvider>
              </PortalRootProvider>
            </ThemeProvider>
          </AuthProvider>
        </GateProvider>
      </ApiProvider>
    </BrowserRouter>
  )
}
