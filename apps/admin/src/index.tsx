import { ApiProvider, createApiClient } from '@repro/api-client'
import { AuthProvider } from '@repro/auth'
import {
  color,
  PortalRootProvider,
  ThemeProvider,
  type ThemeDefinition,
} from '@repro/design'
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

const adminTheme: ThemeDefinition = {
  color: {
    primary: color.neutral,
    primaryHover: color.bg.emphasis,
    primarySubtle: color.bg.hover,
    primarySubtleHover: color.bg.muted,

    text: {
      default: color.text.default,
      secondary: color.neutral,
      muted: color.text.muted,
      label: color.text.label,
      inverse: color.bg.surface,
    },

    bg: {
      surface: color.bg.surface,
      subtle: color.bg.subtle,
      hover: color.bg.hover,
      muted: color.bg.muted,
      strong: color.border.strong,
      emphasis: color.bg.emphasis,
      overlay: 'rgba(0,0,0,0.5)',
    },

    border: {
      default: color.border.default,
      strong: color.border.strong,
      emphasis: color.text.muted,
      focus: color.text.muted,
    },

    danger: color.danger,
    dangerHover: color.dangerHover,
    dangerSubtle: color.dangerSubtle,
    dangerTint: color.dangerTint,
    dangerBorder: color.dangerBorder,
    dangerBorderSubtle: color.dangerBorderSubtle,
    dangerFg: color.dangerFg,

    success: color.success,
    successHover: color.successHover,
    successSubtle: color.successSubtle,
    successTint: color.successTint,
    successBorder: color.successBorder,
    successBorderSubtle: color.successBorderSubtle,
    successFg: color.successFg,

    warning: color.warning,
    warningHover: color.warningHover,
    warningEmphasis: color.warningEmphasis,
    warningEmphasisHover: color.warningEmphasisHover,
    warningSubtle: color.warningSubtle,
    warningTint: color.warningTint,
    warningBorder: color.warningBorder,
    warningBorderSubtle: color.warningBorderSubtle,
    warningFg: color.warningFg,

    info: color.info,
    infoSubtle: color.infoSubtle,
    infoTint: color.infoTint,
    infoBorder: color.infoBorder,
    infoBorderSubtle: color.infoBorderSubtle,
    infoFg: color.infoFg,

    neutral: color.neutral,
    neutralHover: color.text.label,
    neutralBorder: color.text.muted,
    neutralBorderSubtle: color.border.strong,
  },
}

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
            <ThemeProvider theme={adminTheme}>
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
