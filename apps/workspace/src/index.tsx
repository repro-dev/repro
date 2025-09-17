import { Analytics } from '@repro/analytics'
import { mixpanelBrowser } from '@repro/analytics-provider-mixpanel'
import { ApiProvider } from '@repro/api-client'
import { AuthProvider, SessionRouteBoundary } from '@repro/auth'
import { PortalRootProvider } from '@repro/design'
import { Stats } from '@repro/diagnostics'
import { DEFAULT_AGENT } from '@repro/messaging'
import { applyResetStyles } from '@repro/theme'
import React, { lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Layout } from './Layout'

const HomeRoute = lazy(() => import('./routes/HomeRoute'))
const LoginRoute = lazy(() => import('./routes/LoginRoute'))
const MainRoute = lazy(() => import('./routes/MainRoute'))
const RecordingRoute = lazy(() => import('./routes/RecordingRoute'))
const RegisterRoute = lazy(() => import('./routes/RegisterRoute'))

declare global {
  interface Window {
    __REPRO_USING_SDK: boolean
  }
}

window.__REPRO_USING_SDK = true

if (process.env.BUILD_ENV === 'development') {
  Stats.enable()
}

Analytics.setAgent(DEFAULT_AGENT)
Analytics.registerConsumer(mixpanelBrowser)

const rootSelector = '#root'
const rootElem = document.querySelector(rootSelector)
const rootStyleSheet = document.querySelector<HTMLStyleElement>('#root-styles')

if (rootStyleSheet) {
  applyResetStyles(rootSelector, rootStyleSheet)
}

if (rootElem) {
  const root = createRoot(rootElem)

  const basename = process.env.REPRO_APP_URL
    ? new URL(process.env.REPRO_APP_URL).pathname
    : undefined

  root.render(
    <BrowserRouter basename={basename}>
      <ApiProvider>
        <AuthProvider>
          <PortalRootProvider>
            <Routes>
              <Route path="/" element={<MainRoute />}>
                <Route element={<AuthLayout />}>
                  <Route path="account/login" element={<LoginRoute />} />
                  <Route path="account/register" element={<RegisterRoute />} />
                  <Route path="account/verify" element={<div />} />

                  {/* <Route */}
                  {/*   path="account/accept-invitation" */}
                  {/*   element={<AcceptInvitationRoute />} */}
                  {/* /> */}
                </Route>

                <Route element={<Layout />}>
                  <Route element={<SessionRouteBoundary />}>
                    <Route index element={<HomeRoute />} />
                    <Route
                      path="recordings/:recordingId"
                      element={<RecordingRoute />}
                    />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </PortalRootProvider>
        </AuthProvider>
      </ApiProvider>
    </BrowserRouter>
  )
}
