import { ApiProvider, createApiClient } from '@repro/api-client'
import { AuthProvider } from '@repro/auth'
import { PortalRootProvider, ThemeProvider } from '@repro/design'
import { applyResetStyles } from '@repro/theme'
import React, { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary'
import { Loading } from './components/Loading'
import { RequireAdminSession } from './components/RequireAdminSession'
import { RequireAdminStaffSession } from './components/RequireAdminStaffSession'
import { defaultEnv as env } from './config/env'
import { Layout } from './Layout'
import { AccountDetailRoute } from './routes/AccountDetailRoute'
import { AccountsRoute } from './routes/AccountsRoute'
import { FeatureGatesRoute } from './routes/FeatureGatesRoute'
import { HealthRoute } from './routes/HealthRoute'
import { RecordingsRoute } from './routes/RecordingsRoute'
import { StaffUsersRoute } from './routes/StaffUsersRoute'
import { UserDetailRoute } from './routes/UserDetailRoute'

const HomeRoute = React.lazy(() =>
  import('./routes/HomeRoute').then(m => ({ default: m.HomeRoute }))
)
const RecordingRoute = React.lazy(() => import('./routes/RecordingRoute'))
const StaffLoginRoute = React.lazy(() =>
  import('./routes/StaffLoginRoute').then(m => ({ default: m.StaffLoginRoute }))
)

declare global {
  interface Window {
    __REPRO_STANDALONE: boolean
  }
}

window.__REPRO_STANDALONE = true

const apiClient = createApiClient({
  baseUrl: env.REPRO_API_URL,
  authStorage: 'local-storage',
})

const rootSelector = '#root'
const rootElem = document.querySelector(rootSelector)
const rootStyleSheet = document.querySelector(
  '#root-styles'
) as HTMLStyleElement | null

export const AppRoutes: React.FC = () => (
  <Routes>
    <Route element={<AuthLayout />}>
      <Route path="login" element={<StaffLoginRoute />} />
    </Route>

    <Route element={<Layout />}>
      <Route element={<RequireAdminSession />}>
        <Route index element={<HomeRoute />} />
        <Route path="recordings" element={<RecordingsRoute />} />
        <Route path="feature-gates" element={<FeatureGatesRoute />} />
        <Route path="accounts" element={<AccountsRoute />} />
        <Route path="accounts/:accountId" element={<AccountDetailRoute />} />
        <Route path="health" element={<HealthRoute />} />
        <Route element={<RequireAdminStaffSession />}>
          <Route path="staff-users" element={<StaffUsersRoute />} />
          <Route path="users/:userId" element={<UserDetailRoute />} />
        </Route>
      </Route>
    </Route>

    <Route element={<RequireAdminSession />}>
      <Route
        path="projects/:projectId/recordings/:recordingId"
        element={<RecordingRoute />}
      />
      {/*
       * Backward compatibility: old links may still point to
       * /recordings/:recordingId. projectId will be undefined
       * here, which RecordingRoute handles by falling back to
       * empty string (the original behavior for these cases).
       */}
      <Route path="recordings/:recordingId" element={<RecordingRoute />} />
    </Route>
  </Routes>
)

if (rootStyleSheet) {
  applyResetStyles(rootSelector, rootStyleSheet)
}

if (rootElem) {
  const root = createRoot(rootElem)

  const basename = process.env.REPRO_ADMIN_URL
    ? new URL(process.env.REPRO_ADMIN_URL).pathname
    : undefined

  root.render(
    <GlobalErrorBoundary>
      <BrowserRouter basename={basename}>
        <ApiProvider client={apiClient}>
          <AuthProvider basePath="/staff" loginPath="/login">
            <ThemeProvider>
              <PortalRootProvider>
                <Suspense fallback={<Loading />}>
                  <AppRoutes />
                </Suspense>
              </PortalRootProvider>
            </ThemeProvider>
          </AuthProvider>
        </ApiProvider>
      </BrowserRouter>
    </GlobalErrorBoundary>
  )
}
