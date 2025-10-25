import { ApiProvider } from '@repro/api-client'
import { applyResetStyles } from '@repro/theme'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider, SessionRouteBoundary } from '@repro/auth'
import { PortalRootProvider } from '@repro/design'
import { AuthLayout } from './AuthLayout'
import { Layout } from './Layout'
import { HomeRoute } from './routes/HomeRoute'
import { LoginRoute } from './routes/LoginRoute'
import { MainRoute } from './routes/MainRoute'
import { RecordingRoute } from './routes/RecordingRoute/RecordingRoute'

declare global {
  interface Window {
    __REPRO_STANDALONE: boolean
  }
}

window.__REPRO_STANDALONE = true

const rootSelector = '#root'
const rootElem = document.querySelector(rootSelector)
const rootStyleSheet = document.querySelector<HTMLStyleElement>('#root-styles')

if (rootStyleSheet) {
  applyResetStyles(rootSelector, rootStyleSheet)
}

if (rootElem) {
  const root = createRoot(rootElem)

  const basename = process.env.REPRO_ADMIN_URL
    ? new URL(process.env.REPRO_ADMIN_URL).pathname
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
