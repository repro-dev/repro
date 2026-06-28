import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => ({
      fetch: () => {},
    }),
  },
})

mock.module('@repro/future-utils', {
  namedExports: {
    useFuture: () => ({
      loading: false,
      error: null,
      result: { id: 'rec-1', title: 'Test Recording' },
    }),
  },
})

mock.module('@repro/design', {
  namedExports: {
    Link: ({
      children,
      component,
      props,
    }: {
      children: React.ReactNode
      component: React.ElementType
      props?: Record<string, unknown>
    }) => {
      const Component = component
      return <Component {...props}>{children}</Component>
    },
    Logo: () => <div>Logo</div>,
    ToolView: Object.assign(
      ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      {
        Header: ({ children }: { children: React.ReactNode }) => (
          <header>{children}</header>
        ),
        Content: ({ children }: { children: React.ReactNode }) => (
          <main>{children}</main>
        ),
      }
    ),
    Text: ({ children }: { variant?: string; children?: React.ReactNode }) => (
      <span>{children}</span>
    ),
    textStyles: { body: {} },
  },
})

mock.module('@repro/devtools', {
  namedExports: {
    DevTools: () => <div>DevTools</div>,
  },
})

mock.module('@repro/playback', {
  namedExports: {
    PlaybackFromSourceProvider: ({
      children,
    }: {
      children: React.ReactNode
    }) => <>{children}</>,
    createNullSource: () => null,
  },
})

mock.module('@repro/recording-api', {
  namedExports: {
    createApiSource: () => null,
  },
})

mock.module('react-router-dom', {
  namedExports: {
    Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
      <a href={to}>{children}</a>
    ),
    useParams: () => ({
      projectId: 'proj-1',
      recordingId: 'rec-1',
    }),
  },
})

mock.module('~/config/env', {
  namedExports: {
    defaultEnv: {
      REPRO_API_URL: 'http://api.test',
    },
  },
})

mock.module('./Loading', {
  namedExports: {
    Loading: () => <div>Loading...</div>,
  },
})

mock.module('./RecordingError', {
  namedExports: {
    RecordingError: () => <div>Error</div>,
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecordingRoute } =
  require('./RecordingRoute') as typeof import('./RecordingRoute')

describe('RecordingRoute', () => {
  it('renders a back-link labeled "← Recordings" pointing to /recordings', () => {
    const html = renderToStaticMarkup(<RecordingRoute />)

    assert.match(html, /← Recordings/)
    assert.match(html, /href="\/recordings"/)
  })
})
