import { fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

const seekCalls: number[] = []
const destroyedStates: string[] = []
let stateCounter = 0

mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => ({
      fetch: () => {
        throw new Error('fetch should not be called in this test')
      },
    }),
  },
})

mock.module('@repro/playback', {
  namedExports: {
    usePlayback: () => ({
      seekToTime: (timestampMs: number) => seekCalls.push(timestampMs),
    }),
    createSourcePlayback: () => ({
      seekToTime: () => undefined,
      getSnapshot: () => ({}),
    }),
  },
})

mock.module('@repro/agentic', {
  namedExports: {
    EXTENSION_SYSTEM_CARD_MESSAGE: 'extension-system-card',
    createAgenticState: () => {
      stateCounter += 1
      const id = `state-${stateCounter}`
      return {
        $stage: {
          getValue: () => 'idle' as const,
          pipe: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
        },
        $hypotheses: {
          getValue: () => [] as Array<never>,
          pipe: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
        },
        destroy: () => destroyedStates.push(id),
      }
    },
    extensionTools: [],
    makeAccessorFromEventList: () => ({
      getEventsByType: () => [],
      getEventsInRange: () => [],
    }),
  },
})

mock.module('@repro/agentic-ui', {
  namedExports: {
    AgenticStateContext: React.createContext(null),
    AgenticView: ({
      onGoToTime,
      onInvestigationComplete: _onInvestigationComplete,
    }: {
      onGoToTime: (timestampMs: number) => void
      onInvestigationComplete?: (summary: string) => void
    }) => (
      <button type="button" onClick={() => onGoToTime(5_000)}>
        Go to agentic time
      </button>
    ),
  },
})

// Must require() after mock registration so the mocks take effect
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Agentic } = require('./Agentic.hoc') as typeof import('./Agentic.hoc')

function createSelectedRecording(startTimeMs: number) {
  return {
    duration: 30_000,
    startTimeMs,
    events: { toSource: () => [] },
    resourceMap: {},
  }
}

describe('Agentic', () => {
  afterEach(() => {
    seekCalls.length = 0
    destroyedStates.length = 0
    stateCounter = 0
  })

  it('translates normalized agentic time links to source playback time', () => {
    render(
      <Agentic
        getSelectedRecording={() => createSelectedRecording(70_000) as any}
      />
    )

    fireEvent.click(screen.getByText('Go to agentic time'))

    assert.deepEqual(seekCalls, [75_000])
  })

  it('destroys replaced and unmounted agentic states', () => {
    const first = () => createSelectedRecording(0) as any
    const second = () => createSelectedRecording(10_000) as any
    const view = render(<Agentic getSelectedRecording={first} />)

    view.rerender(<Agentic getSelectedRecording={second} />)
    assert.deepEqual(destroyedStates, ['state-1'])

    view.unmount()
    assert.deepEqual(destroyedStates, ['state-1', 'state-2'])
  })
})
