import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import { createBillingClientFromConfig } from './index'

function setupPaddleMock() {
  const calls: Record<string, unknown[][]> = {
    'Environment.set': [],
    Initialize: [],
    'Checkout.open': [],
    'Checkout.close': [],
  }

  const paddle = {
    Environment: {
      set: mock.fn((...args: unknown[]) => {
        calls['Environment.set']!.push(args)
      }),
    },
    Initialize: mock.fn((...args: unknown[]) => {
      calls['Initialize']!.push(args)
    }),
    Checkout: {
      open: mock.fn((...args: unknown[]) => {
        calls['Checkout.open']!.push(args)
      }),
      close: mock.fn((...args: unknown[]) => {
        calls['Checkout.close']!.push(args)
      }),
    },
  }

  ;(globalThis as Record<string, unknown>).window = { Paddle: paddle }
  return { paddle, calls }
}

function clearPaddleMock() {
  delete (globalThis as Record<string, unknown>).window
}

describe('billing', () => {
  afterEach(() => {
    clearPaddleMock()
  })

  describe('createBillingClientFromConfig', () => {
    describe('init', () => {
      it('calls Paddle.Initialize with the provided token', () => {
        const { calls } = setupPaddleMock()
        const client = createBillingClientFromConfig({ token: 'test_token_123' })

        client.init()

        expect(calls['Initialize']).toHaveLength(1)
        expect(calls['Initialize']![0]![0]).toEqual({
          token: 'test_token_123',
          eventCallback: undefined,
        })
      })

      it('sets sandbox environment before initializing', () => {
        setupPaddleMock()
        const callOrder: string[] = []

        const paddle = (
          (globalThis as Record<string, unknown>).window as Record<
            string,
            unknown
          >
        ).Paddle as Record<string, Record<string, unknown>>
        paddle['Environment']!.set = mock.fn(() => {
          callOrder.push('Environment.set')
        })
        paddle['Initialize'] = mock.fn(() => {
          callOrder.push('Initialize')
        }) as unknown as Record<string, unknown>

        const client = createBillingClientFromConfig({
          token: 'test_token_123',
          environment: 'sandbox',
        })

        client.init()

        expect(callOrder).toEqual(['Environment.set', 'Initialize'])
      })

      it('does not set environment for production', () => {
        const { paddle } = setupPaddleMock()
        const client = createBillingClientFromConfig({
          token: 'live_token_456',
          environment: 'production',
        })

        client.init()

        expect(paddle.Environment.set.mock.callCount()).toBe(0)
      })

      it('does not set environment when not specified', () => {
        const { paddle } = setupPaddleMock()
        const client = createBillingClientFromConfig({ token: 'live_token_456' })

        client.init()

        expect(paddle.Environment.set.mock.callCount()).toBe(0)
      })

      it('passes eventCallback to Paddle.Initialize', () => {
        const { calls } = setupPaddleMock()
        const callback = () => {}
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
          eventCallback: callback,
        })

        client.init()

        expect(
          (calls['Initialize']![0]![0] as Record<string, unknown>)
            .eventCallback
        ).toBe(callback)
      })

      it('only initializes once', () => {
        const { calls } = setupPaddleMock()
        const client = createBillingClientFromConfig({ token: 'test_token_123' })

        client.init()
        client.init()

        expect(calls['Initialize']).toHaveLength(1)
      })

      it('does nothing when Paddle is not loaded', () => {
        ;(globalThis as Record<string, unknown>).window = {}
        const client = createBillingClientFromConfig({ token: 'test_token_123' })

        expect(() => client.init()).not.toThrow()
      })
    })

    describe('openCheckout', () => {
      it('calls Paddle.Checkout.open with options', () => {
        const { calls } = setupPaddleMock()
        const client = createBillingClientFromConfig({ token: 'test_token_123' })
        const options = { items: [{ priceId: 'pri_123' }] }

        client.openCheckout(options)

        expect(calls['Checkout.open']).toHaveLength(1)
        expect(calls['Checkout.open']![0]![0]).toEqual(options)
      })

      it('does nothing when Paddle is not loaded', () => {
        ;(globalThis as Record<string, unknown>).window = {}
        const client = createBillingClientFromConfig({ token: 'test_token_123' })

        expect(() => client.openCheckout({})).not.toThrow()
      })
    })

    describe('closeCheckout', () => {
      it('calls Paddle.Checkout.close', () => {
        const { calls } = setupPaddleMock()
        const client = createBillingClientFromConfig({ token: 'test_token_123' })

        client.closeCheckout()

        expect(calls['Checkout.close']).toHaveLength(1)
      })

      it('does nothing when Paddle is not loaded', () => {
        ;(globalThis as Record<string, unknown>).window = {}
        const client = createBillingClientFromConfig({ token: 'test_token_123' })

        expect(() => client.closeCheckout()).not.toThrow()
      })
    })
  })
})
