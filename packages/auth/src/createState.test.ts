import { ApiClient } from '@repro/api-client'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { createState } from './createState'

function createMockApiClient(): ApiClient & {
  fetch: ReturnType<typeof mock.fn>
} {
  const fetchMock = mock.fn((_url: string) => resolve(null as any))

  return {
    authStore: {
      getSessionToken: () => resolve(''),
      setSessionToken: () => resolve(''),
      clearSessionToken: () => resolve(undefined),
    },
    fetch: fetchMock,
    debug: (method: any) => method.pipe((x: any) => x),
    wrapP: (method: any) => Promise.resolve(method),
  }
}

describe('createState', () => {
  describe('default basePath (/account)', () => {
    it('login calls /account/login', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient })
      state.login('user@example.com', 'password')
      assert.equal(apiClient.fetch.mock.calls.length, 1)
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/account/login'
      )
    })

    it('logout calls /account/logout', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient })
      state.logout()
      assert.equal(apiClient.fetch.mock.calls.length, 1)
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/account/logout'
      )
    })

    it('loadSession calls /account/me', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient })
      state.loadSession()
      assert.equal(apiClient.fetch.mock.calls.length, 1)
      assert.equal(apiClient.fetch.mock.calls[0]?.arguments[0], '/account/me')
    })

    it('register calls /account/register', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient })
      state.register('Acme', 'Alice', 'alice@example.com', 'password')
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/account/register'
      )
    })

    it('verify calls /account/verify', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient })
      state.verify('token', 'alice@example.com')
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/account/verify'
      )
    })

    it('resetPassword calls /account/reset-password', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient })
      state.resetPassword('alice@example.com')
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/account/reset-password'
      )
    })

    it('invite calls /account/invite', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient })
      state.invite('alice@example.com')
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/account/invite'
      )
    })

    it('acceptInvitation calls /account/accept-invitation', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient })
      state.acceptInvitation('token', 'Alice', 'alice@example.com', 'password')
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/account/accept-invitation'
      )
    })
  })

  describe('custom basePath (/staff)', () => {
    it('login calls /staff/login', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, basePath: '/staff' })
      state.login('staff@example.com', 'password')
      assert.equal(apiClient.fetch.mock.calls[0]?.arguments[0], '/staff/login')
    })

    it('logout calls /staff/logout', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, basePath: '/staff' })
      state.logout()
      assert.equal(apiClient.fetch.mock.calls[0]?.arguments[0], '/staff/logout')
    })

    it('loadSession calls /staff/me', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, basePath: '/staff' })
      state.loadSession()
      assert.equal(apiClient.fetch.mock.calls[0]?.arguments[0], '/staff/me')
    })

    it('register calls /staff/register', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, basePath: '/staff' })
      state.register('Acme', 'Alice', 'alice@example.com', 'password')
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/staff/register'
      )
    })

    it('verify calls /staff/verify', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, basePath: '/staff' })
      state.verify('token', 'alice@example.com')
      assert.equal(apiClient.fetch.mock.calls[0]?.arguments[0], '/staff/verify')
    })

    it('resetPassword calls /staff/reset-password', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, basePath: '/staff' })
      state.resetPassword('alice@example.com')
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/staff/reset-password'
      )
    })

    it('invite calls /staff/invite', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, basePath: '/staff' })
      state.invite('alice@example.com')
      assert.equal(apiClient.fetch.mock.calls[0]?.arguments[0], '/staff/invite')
    })

    it('acceptInvitation calls /staff/accept-invitation', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, basePath: '/staff' })
      state.acceptInvitation('token', 'Alice', 'alice@example.com', 'password')
      assert.equal(
        apiClient.fetch.mock.calls[0]?.arguments[0],
        '/staff/accept-invitation'
      )
    })
  })

  describe('loginPath', () => {
    it('defaults to basePath + /login when no loginPath specified', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient })
      assert.equal(state.loginPath, '/account/login')
    })

    it('defaults to custom basePath + /login when basePath is set', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, basePath: '/staff' })
      assert.equal(state.loginPath, '/staff/login')
    })

    it('stores and returns a custom loginPath', () => {
      const apiClient = createMockApiClient()
      const state = createState({ apiClient, loginPath: '/auth/sign-in' })
      assert.equal(state.loginPath, '/auth/sign-in')
    })

    it('custom loginPath overrides basePath-derived default', () => {
      const apiClient = createMockApiClient()
      const state = createState({
        apiClient,
        basePath: '/staff',
        loginPath: '/staff/auth/login',
      })
      assert.equal(state.loginPath, '/staff/auth/login')
    })
  })
})
