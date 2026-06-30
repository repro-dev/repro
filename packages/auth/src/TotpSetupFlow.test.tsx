import { ApiProvider } from '@repro/api-client'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FutureInstance, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

// ---------------------------------------------------------------------------
// Module mocks — must be called before module imports
// ---------------------------------------------------------------------------

mock.module('@repro/design', {
  namedExports: {
    Alert: ({ children, type }: any) =>
      React.createElement(
        'div',
        { role: 'alert', 'data-type': type },
        children
      ),
    Block: ({ children }: any) => React.createElement('div', null, children),
    Button: ({ children, onClick, disabled, type }: any) =>
      React.createElement(
        'button',
        { onClick, disabled, type: type || 'button' },
        children
      ),
    Card: ({ children }: any) =>
      React.createElement('div', { className: 'card' }, children),
    Col: ({ children }: any) => React.createElement('div', null, children),
    Input: (props: any) => React.createElement('input', props),
    Label: ({ children }: any) => React.createElement('label', null, children),
    LoadingState: () =>
      React.createElement(
        'div',
        { 'data-testid': 'loading-state' },
        'Loading...'
      ),
    Row: ({ children }: any) => React.createElement('div', null, children),
    Text: ({ children, variant, as }: any) =>
      React.createElement(as || 'span', { 'data-variant': variant }, children),
    color: {
      primary: '#2563eb',
      text: { default: '#0f172a', muted: '#64748b', secondary: '#334155' },
      success: '#16a34a',
      danger: '#be123c',
      bg: { subtle: '#f8fafc' },
    },
    fontFamily: { mono: 'monospace' },
    fontSize: { md: 14 },
    radius: { md: 8, none: 0, sm: 4, lg: 16, full: '9999px' },
    spacing: { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, '2xl': 24 },
  },
})

const { TotpSetupFlow } =
  require('./TotpSetupFlow') as typeof import('./TotpSetupFlow')

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const setupResult = {
  secret: 'JBSWY3DPEHPK3PXP',
  otpauthUri:
    'otpauth://totp/Repro:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Repro',
  qrDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
}

const confirmResult = {
  items: ['ABCD-EFGH', 'IJKL-MNOP', 'QRST-UVWX', 'YZAB-CDEF', 'GHIJ-KLMN'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
})

/**
 * Render TotpSetupFlow wrapped in ApiProvider with a mock client.
 * The mock fetch method returns Futures for API calls.
 */
function renderFlow(
  fetchImpl: (...args: Array<any>) => FutureInstance<Error, any>,
  onComplete = mock.fn(),
  onCancel = mock.fn()
) {
  const mockClient = {
    authStore: {
      getSessionToken: () => resolve(''),
      setSessionToken: () => resolve(''),
      clearSessionToken: () => resolve(undefined),
    },
    fetch: mock.fn(fetchImpl),
    debug: (method: any) => method.pipe((x: any) => x),
    wrapP: (method: any) => Promise.resolve(method),
  }

  const { rerender } = render(
    React.createElement(
      ApiProvider,
      { client: mockClient },
      React.createElement(TotpSetupFlow, { onComplete, onCancel })
    )
  )

  return { mockClient, rerender }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TotpSetupFlow', () => {
  it('shows QR code and manual key after setup resolves', async () => {
    renderFlow(() => resolve(setupResult))
    await new Promise(r => setTimeout(r, 30))

    assert.ok(screen.getByText('Set up authenticator app'))
    const qrImg = screen.getByAltText('TOTP QR code')
    assert.ok(qrImg)
    assert.equal(qrImg.getAttribute('src'), setupResult.qrDataUrl)
    assert.ok(screen.getByText(setupResult.secret))
  })

  it('disables confirm button until 6 digits are entered', async () => {
    renderFlow(() => resolve(setupResult))
    await new Promise(r => setTimeout(r, 30))

    const btn = screen.getByText('Verify & enable') as HTMLButtonElement
    assert.ok(btn.disabled)

    const input = screen.getByPlaceholderText('000000') as HTMLInputElement
    fireEvent.change(input, { target: { value: '123456' } })
    await new Promise(r => setTimeout(r, 30))

    assert.equal(btn.disabled, false)
  })

  it('shows error when confirm fails', async () => {
    let callIdx = 0
    renderFlow(() => {
      callIdx++
      if (callIdx === 1) return resolve(setupResult)
      return reject(new Error('Invalid code. Please try again.'))
    })
    await new Promise(r => setTimeout(r, 50))

    const input = screen.getByPlaceholderText('000000') as HTMLInputElement
    fireEvent.change(input, { target: { value: '000000' } })
    await new Promise(r => setTimeout(r, 30))

    fireEvent.click(screen.getByText('Verify & enable'))
    await new Promise(r => setTimeout(r, 50))

    const alerts = screen.getAllByRole('alert')
    assert.ok(alerts.some(a => a.textContent?.includes('Invalid code')))
  })

  it('shows backup codes after successful confirm', async () => {
    let callIdx = 0
    void renderFlow(() => {
      callIdx++
      return callIdx === 1 ? resolve(setupResult) : resolve(confirmResult)
    })
    await new Promise(r => setTimeout(r, 50))

    // Type code and confirm
    const input = screen.getByPlaceholderText('000000') as HTMLInputElement
    fireEvent.change(input, { target: { value: '123456' } })
    await new Promise(r => setTimeout(r, 30))

    const verifyBtn = screen.getByText('Verify & enable') as HTMLButtonElement
    assert.equal(verifyBtn.disabled, false)

    // Click verify using fireEvent for proper React synthetic event handling
    fireEvent.click(verifyBtn)
    await new Promise(r => setTimeout(r, 50))

    assert.ok(screen.getByText('Two-factor authentication enabled'))
    assert.ok(screen.getByText('ABCD-EFGH'))
  })
})
