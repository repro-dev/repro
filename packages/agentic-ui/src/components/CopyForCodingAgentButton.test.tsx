import type {
  AgenticError,
  Entry,
  Hypothesis,
  PendingAskUserInteraction,
  RecordingMeta,
} from '@repro/agentic'
import { atom } from '@repro/atom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

// Helper to mock clipboard in tests
function setMockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  })
}

// Mock buildCodingAgentExport from @repro/agentic
// Provide default implementation that returns mock markdown
const mockBuildExport = mock.fn<
  (entries: unknown, hypotheses: unknown, meta: unknown) => string
>(() => '# Mock Markdown')
mock.module('@repro/agentic', {
  namedExports: {
    buildCodingAgentExport: mockBuildExport,
  },
})

// Import after mocks are registered
// We import the context from its real location (types are erased at runtime)
const { AgenticStateContext } =
  require('../context') as typeof import('../context')
const { CopyForCodingAgentButton } =
  require('./CopyForCodingAgentButton') as typeof import('./CopyForCodingAgentButton')

const meta: RecordingMeta = {
  browser: 'Chrome 120',
  durationMs: 45200,
  recordingUrl: 'https://app.repro.dev/r/abc123',
}

function createAssistantEntry(content: string): Entry {
  return {
    id: '1',
    timestamp: new Date(),
    role: 'assistant',
    content,
    toolCalls: [],
  }
}

function createUserEntry(content: string): Entry {
  return { id: '2', timestamp: new Date(), role: 'user', content }
}

function renderWithState(
  entries: Array<Entry>,
  hypotheses: Array<Hypothesis> = [],
  recordingMeta: RecordingMeta | null = null
) {
  return render(
    <AgenticStateContext.Provider
      value={{
        $entries: atom(entries),
        $loading: atom<
          'none' | 'reasoning' | 'responding' | 'tool-executing' | 'cancelled'
        >('none'),
        $error: atom<AgenticError | null>(null),
        $wasCancelled: atom(false),
        $stage: atom<
          'idle' | 'orient' | 'hypotheses' | 'evidence' | 'conclusion'
        >('idle'),
        $hypotheses: atom(hypotheses),
        $pendingInteraction: atom<PendingAskUserInteraction | null>(null),
        $truncatedBefore: atom<string | null>(null),
        cancel: () => undefined,
        destroy: () => undefined,
        submitAskUserAnswer: () => undefined,
        query: () => undefined,
        reset: () => undefined,
      }}
    >
      <CopyForCodingAgentButton recordingMeta={recordingMeta} />
    </AgenticStateContext.Provider>
  )
}

afterEach(() => {
  cleanup()
  mockBuildExport.mock.resetCalls()
})

describe('CopyForCodingAgentButton', () => {
  it('renders nothing when there are no assistant messages', () => {
    const { container } = renderWithState([createUserEntry('Hello')], [], null)
    expect(container.innerHTML).toBe('')
  })

  it('shows button when there are assistant messages', () => {
    renderWithState(
      [createUserEntry('Hello'), createAssistantEntry('Hi there!')],
      [],
      null
    )
    expect(
      screen.getByRole('button', { name: /copy for coding agent/i })
    ).toBeDefined()
  })

  it('copies markdown to clipboard on click', async () => {
    let clipboardText = ''
    const originalClipboard = navigator.clipboard
    setMockClipboard((text: string) => {
      clipboardText = text
      return Promise.resolve()
    })

    renderWithState(
      [createUserEntry('Hello'), createAssistantEntry('I found the bug.')],
      [],
      meta
    )

    const button = screen.getByRole('button', {
      name: /copy for coding agent/i,
    })
    fireEvent.click(button)

    // Wait for microtask (clipboard writeText is async)
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(clipboardText).toBe('# Mock Markdown')

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    })
  })

  it('shows Copied feedback after click', async () => {
    const originalClipboard = navigator.clipboard
    setMockClipboard(() => Promise.resolve())

    renderWithState(
      [createUserEntry('Hello'), createAssistantEntry('I found the bug.')],
      [],
      meta
    )

    const button = screen.getByRole('button', {
      name: /copy for coding agent/i,
    })
    fireEvent.click(button)

    await new Promise(resolve => setTimeout(resolve, 10))

    // After copy, button text changes to "Copied!"
    expect(button.textContent).toMatch(/Copied!/)

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    })
  })

  it('resets Copied feedback after 2s', async () => {
    const originalClipboard = navigator.clipboard
    setMockClipboard(() => Promise.resolve())

    renderWithState(
      [createUserEntry('Hello'), createAssistantEntry('I found the bug.')],
      [],
      meta
    )

    const button = screen.getByRole('button', {
      name: /copy for coding agent/i,
    })
    fireEvent.click(button)

    await new Promise(resolve => setTimeout(resolve, 10))

    // After copy, button text is "Copied!"
    expect(button.textContent).toMatch(/Copied!/)

    // Wait for the 2s timeout to elapse
    await new Promise(resolve => setTimeout(resolve, 2100))

    // After timeout, button text reverts
    expect(button.textContent).toMatch(/Copy for coding agent/)

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    })
  })

  it('handles clipboard API failure gracefully', async () => {
    const originalClipboard = navigator.clipboard
    setMockClipboard(() => Promise.reject(new Error('Clipboard denied')))

    renderWithState(
      [createUserEntry('Hello'), createAssistantEntry('I found the bug.')],
      [],
      meta
    )

    const button = screen.getByRole('button', {
      name: /copy for coding agent/i,
    })
    fireEvent.click(button)

    await new Promise(resolve => setTimeout(resolve, 10))

    // Button should still show original text after failure
    expect(button.textContent).toMatch(/Copy for coding agent/)

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    })
  })
})
