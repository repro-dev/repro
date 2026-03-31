import { ApiProvider } from '@repro/api-client'
import { AuthProvider, SessionRouteBoundary } from '@repro/auth'
import {
  colors,
  PortalRootProvider,
  ThemeProvider,
  type ThemeDefinition,
} from '@repro/design'
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

const adminTheme: ThemeDefinition = {
  color: {
    primary: colors.slate['700'],
    primaryHover: colors.slate['800'],
    primarySubtle: colors.slate['100'],
    primarySubtleHover: colors.slate['200'],

    text: {
      default: colors.slate['900'],
      secondary: colors.slate['700'],
      muted: colors.slate['500'],
      label: colors.slate['600'],
      inverse: colors.white,
    },

    bg: {
      surface: colors.white,
      subtle: colors.slate['50'],
      hover: colors.slate['100'],
      muted: colors.slate['200'],
      emphasis: colors.slate['800'],
      overlay: 'rgba(0,0,0,0.5)',
    },

    border: {
      default: colors.slate['200'],
      strong: colors.slate['300'],
      emphasis: colors.slate['500'],
      focus: colors.slate['500'],
    },

    danger: colors.rose['700'],
    dangerHover: colors.rose['800'],
    dangerSubtle: colors.rose['100'],
    dangerTint: colors.rose['50'],
    dangerBorder: colors.rose['500'],
    dangerBorderSubtle: colors.rose['300'],
    dangerFg: colors.rose['900'],

    success: colors.green['700'],
    successHover: colors.green['800'],
    successSubtle: colors.green['100'],
    successTint: colors.green['50'],
    successBorder: colors.green['600'],
    successBorderSubtle: colors.green['300'],
    successFg: colors.green['900'],

    warning: colors.amber['700'],
    warningHover: colors.amber['800'],
    warningEmphasis: colors.amber['400'],
    warningEmphasisHover: colors.amber['500'],
    warningSubtle: colors.amber['100'],
    warningTint: colors.amber['50'],
    warningBorder: colors.amber['600'],
    warningBorderSubtle: colors.amber['300'],
    warningFg: colors.amber['900'],

    info: colors.blue['700'],
    infoSubtle: colors.blue['100'],
    infoTint: colors.blue['50'],
    infoBorder: colors.blue['500'],
    infoBorderSubtle: colors.blue['300'],
    infoFg: colors.blue['900'],

    neutral: colors.slate['700'],
    neutralHover: colors.slate['600'],
    neutralBorder: colors.slate['500'],
    neutralBorderSubtle: colors.slate['300'],
  },
}

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
          <ThemeProvider theme={adminTheme}>
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
