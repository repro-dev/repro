import { ApiProvider } from '@repro/api-client'
import { AuthProvider, SessionRouteBoundary } from '@repro/auth'
import { colors, PortalRootProvider, ThemeProvider } from '@repro/design'
import { applyResetStyles } from '@repro/theme'
import React, { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Loading } from './components/Loading'
import { Layout } from './Layout'
import { HomeRoute } from './routes/HomeRoute'
import { LoginRoute } from './routes/LoginRoute'
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
          <ThemeProvider
            brand={{
              gradient: {
                from: colors.slate['900'],
                to: colors.slate['700'],
              },
            }}
          >
            <PortalRootProvider>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route element={<AuthLayout />}>
                    <Route path="account/login" element={<LoginRoute />} />
                  </Route>

                  <Route element={<Layout />}>
                    <Route element={<SessionRouteBoundary />}>
                      <Route index element={<HomeRoute />} />
                    </Route>
                  </Route>

                  <Route element={<SessionRouteBoundary />}>
                    <Route
                      path="recordings/:recordingId"
                      element={<RecordingRoute />}
                    />
                  </Route>
                </Routes>
              </Suspense>
            </PortalRootProvider>
          </ThemeProvider>
        </AuthProvider>
      </ApiProvider>
    </BrowserRouter>
  )
}
