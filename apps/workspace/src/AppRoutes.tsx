import { Block } from '@jsxstyle/react'
import { SessionRouteBoundary } from '@repro/auth'
import React, { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Loading } from './components/Loading'
import { NotFoundRoute } from './components/NotFoundRoute'
import { Layout } from './Layout'

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
const ShareRoute = lazy(() => import('./routes/ShareRoute'))

/**
 * The workspace route tree, extracted from the app entry so it can be tested
 * without mounting the full provider stack. The provider order, `basename`
 * logic, and root-element guard stay in index.tsx.
 */
export const AppRoutes: React.FC = () => (
  <Suspense fallback={<Loading />}>
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="account/login" element={<LoginRoute />} />
        <Route path="account/register" element={<RegisterRoute />} />
        <Route path="account/verify" element={<Block />} />
        <Route
          path="account/reset-password/:token"
          element={<ResetPasswordRoute />}
        />
        <Route
          path="account/accept-invitation"
          element={<AcceptInvitationRoute />}
        />
      </Route>

      <Route path="share/:token" element={<ShareRoute />} />

      <Route element={<Layout />}>
        <Route element={<SessionRouteBoundary />}>
          <Route index element={<HomeRoute />} />
          <Route path="projects" element={<ProjectsRoute />} />
          <Route path="pricing" element={<PricingRoute />} />
          <Route
            path="account/api-keys"
            element={<Navigate to="/settings/api-keys" replace />}
          />
          <Route path="settings/*" element={<SettingsRoute />} />
          <Route
            path="projects/:projectId/recordings/:recordingId"
            element={<RecordingRoute />}
          />
          <Route
            path="projects/:projectId/settings"
            element={<ProjectSettingsRoute />}
          />
          <Route path="*" element={<NotFoundRoute />} />
        </Route>
      </Route>
    </Routes>
  </Suspense>
)
