import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let currentStatus: 'ok' | 'degraded' | 'unhealthy' | null = 'ok'

mock.module('@repro/design', {
  namedExports: {
    color: {
      bg: {
        hover: '#f8fafc',
      },
      danger: '#dc2626',
      success: '#16a34a',
      warning: '#d97706',
      text: {
        default: '#0f172a',
        secondary: '#475569',
      },
    },
    focusRing: () => ({}),
    fontSize: {
      xs: 11,
    },
    lineHeight: {
      relaxed: 1.5,
    },
    fontWeight: {
      semibold: 600,
    },
    radius: {
      full: 9999,
    },
    spacing: {
      lg: 16,
      md: 12,
      sm: 8,
      xs: 4,
    },
    textStyles: {
      bodySmall: {
        fontSize: 13,
        fontWeight: 400,
        lineHeight: 1.5,
      },
      label: {
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.5,
      },
    },
    transition: {
      fast: 'background-color 120ms ease',
    },
  },
})

mock.module('react-router-dom', {
  namedExports: {
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  },
})

const statusCases: Array<['ok' | 'degraded' | 'unhealthy', string]> = [
  ['ok', 'Healthy'],
  ['degraded', 'Degraded'],
  ['unhealthy', 'Unhealthy'],
]

mock.module('~/hooks/useHealthStatus', {
  namedExports: {
    getHealthStatusLabel: (nextStatus: 'ok' | 'degraded' | 'unhealthy') =>
      nextStatus === 'ok'
        ? 'Healthy'
        : nextStatus === 'degraded'
        ? 'Degraded'
        : 'Unhealthy',
    useHealthStatus: () => ({
      status: currentStatus,
    }),
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HealthStatusFooter } =
  require('./HealthStatusFooter') as typeof import('./HealthStatusFooter')

afterEach(() => {
  currentStatus = 'ok'
})

describe('HealthStatusFooter', () => {
  for (const [status, label] of statusCases) {
    it(`renders ${status} status prominently`, () => {
      currentStatus = status

      const html = renderToStaticMarkup(<HealthStatusFooter />)

      assert.match(html, /System health/)
      assert.match(html, new RegExp(label))
      assert.match(html, /href="\/health"/)
    })
  }
})
