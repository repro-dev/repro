import { PortalRootProvider } from '@repro/design'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import * as ReactRouterDom from 'react-router-dom'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// The api-client mock is URL-driven so the detail route's real useFuture
// forks resolve per path (lookup, info).
const fetchCalls: string[] = []

let projectLookupResult: string | null = null
let infoFailure: Error | null = null

const mockApiClient = {
  fetch: (path: string) => {
    fetchCalls.push(path)

    if (path === '/staff/recordings/rec-1/project') {
      return resolve({ projectId: projectLookupResult })
    }

    if (path === '/staff/recordings/rec-404/project') {
      return resolve({ projectId: null })
    }

    if (path === '/projects/proj-1/recordings/rec-1/info') {
      return infoFailure
        ? reject(infoFailure)
        : resolve({
            id: 'rec-1',
            title: 'Simple Interaction',
            url: 'https://app.acme.dev/checkout',
          })
    }

    return reject(new Error(`Unexpected fetch: ${path}`))
  },
}

mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => mockApiClient,
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

// Real react-router-dom so useParams/Navigate/Routes resolve actual paths;
// only the design Link stub is preserved.
mock.module('react-router-dom', {
  namedExports: {
    ...ReactRouterDom,
    Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
      <a href={to}>{children}</a>
    ),
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
    Loading: () => <div>Loading…</div>,
  },
})

mock.module('./RecordingError', {
  namedExports: {
    RecordingError: () => <div>recording-error-state</div>,
  },
})

mock.module('~/components/NotFoundRoute', {
  namedExports: {
    NotFoundRoute: () => <div>not-found marker</div>,
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecordingRoute } =
  require('./RecordingRoute') as typeof import('./RecordingRoute')

afterEach(cleanup)

function renderRoute(initialEntry: string) {
  return render(
    <PortalRootProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/projects/:projectId/recordings/:recordingId"
            element={<RecordingRoute />}
          />
          <Route path="/recordings/:recordingId" element={<RecordingRoute />} />
        </Routes>
      </MemoryRouter>
    </PortalRootProvider>
  )
}

describe('RecordingRoute', () => {
  afterEach(() => {
    fetchCalls.length = 0
    projectLookupResult = null
    infoFailure = null
  })

  it('renders a back-link labeled "← Recordings" pointing to /recordings', async () => {
    projectLookupResult = 'proj-1'

    renderRoute('/projects/proj-1/recordings/rec-1')

    await waitFor(() => {
      assert.match(document.body.innerHTML ?? '', /← Recordings/)
    })
    assert.match(document.body.innerHTML, /href="\/recordings"/)
  })

  it('resolves the info for the canonical route without a project lookup (positive)', async () => {
    renderRoute('/projects/proj-1/recordings/rec-1')

    await waitFor(() => {
      assert.ok(screen.getByText('Simple Interaction'))
    })

    assert.ok(fetchCalls.includes('/projects/proj-1/recordings/rec-1/info'))
    assert.equal(
      fetchCalls.some(path => path.startsWith('/staff/recordings/')),
      false
    )
    assert.equal(screen.queryByText('not-found marker'), null)
  })

  it('resolves the backward-compat route via lookup then redirect (positive — the seeded-list-row path)', async () => {
    projectLookupResult = 'proj-1'

    renderRoute('/recordings/rec-1')

    await waitFor(() => {
      assert.ok(screen.getByText('Simple Interaction'))
    })

    // The lookup ran first, then the info fetch for the canonical URL
    assert.ok(fetchCalls.includes('/staff/recordings/rec-1/project'))
    assert.ok(fetchCalls.includes('/projects/proj-1/recordings/rec-1/info'))
    assert.equal(screen.queryByText('not-found marker'), null)
  })

  it('renders the not-found state when the lookup resolves no project (negative)', async () => {
    renderRoute('/recordings/rec-404')

    await waitFor(() => {
      assert.ok(screen.getByText('not-found marker'))
    })

    // The info fetch never fires with an empty projectId
    assert.equal(
      fetchCalls.some(path => path.includes('/info')),
      false
    )
  })

  it('renders the recording error state for an unknown id on the canonical route (negative)', async () => {
    infoFailure = new Error('Recording not found')

    renderRoute('/projects/proj-1/recordings/rec-404')

    await waitFor(() => {
      assert.ok(screen.getByText('recording-error-state'))
    })

    assert.equal(screen.queryByText('not-found marker'), null)
  })
})
