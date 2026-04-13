import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
const { createBillingClientFromConfig } = require('./index')

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
      it('calls Paddle.Initialize with the provided token', async () => {
        const { calls } = setupPaddleMock()
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
        })

        client.init()
        await Promise.resolve()

        expect(calls['Initialize']).toHaveLength(1)
        const initArg = calls['Initialize']![0]![0] as Record<string, unknown>
        expect(initArg['token']).toBe('test_token_123')
        expect(typeof initArg['eventCallback']).toBe('function')
      })

      it('sets sandbox environment before initializing', async () => {
        setupPaddleMock()
        const callOrder: string[] = []

        const paddle = (window as Record<string, Record<string, unknown>>)
          .Paddle as Record<string, Record<string, unknown>>
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
        await Promise.resolve()

        expect(callOrder).toEqual(['Environment.set', 'Initialize'])
      })

      it('does not set environment for production', async () => {
        const { paddle } = setupPaddleMock()
        const client = createBillingClientFromConfig({
          token: 'live_token_456',
          environment: 'production',
        })

        client.init()
        await Promise.resolve()

        expect(paddle.Environment.set.mock.callCount()).toBe(0)
      })

      it('does not set environment when not specified', async () => {
        const { paddle } = setupPaddleMock()
        const client = createBillingClientFromConfig({
          token: 'live_token_456',
        })

        client.init()
        await Promise.resolve()

        expect(paddle.Environment.set.mock.callCount()).toBe(0)
      })

      it('passes eventCallback through handleEvent wrapper to Paddle.Initialize', () => {
        const { calls } = setupPaddleMock()
        const received: unknown[] = []
        const callback = (data: unknown) => received.push(data)
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
          eventCallback: callback,
        })

        client.init()
        const handleEvent = (
          calls['Initialize']![0]![0] as Record<string, unknown>
        ).eventCallback as (d: unknown) => void
        handleEvent({ name: 'custom.event' })

        expect(received).toHaveLength(1)
        expect((received[0] as Record<string, unknown>).name).toBe(
          'custom.event'
        )
      })

      it('only initializes once', async () => {
        const { calls } = setupPaddleMock()
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
        })

        client.init()
        client.init()
        await Promise.resolve()

        expect(calls['Initialize']).toHaveLength(1)
      })

      it('does nothing when Paddle is not loaded', () => {
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
        })

        expect(() => client.init()).not.toThrow()
      })
    })

    describe('openCheckout', () => {
      it('calls Paddle.Checkout.open with options', () => {
        const { calls } = setupPaddleMock()
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
        })
        const options = { items: [{ priceId: 'pri_123' }] }

        client.openCheckout(options)

        expect(calls['Checkout.open']).toHaveLength(1)
        expect(calls['Checkout.open']![0]![0]).toEqual(options)
      })

      it('does nothing when Paddle is not loaded', () => {
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
        })

        expect(() => client.openCheckout({})).not.toThrow()
      })
    })

    describe('closeCheckout', () => {
      it('calls Paddle.Checkout.close', () => {
        const { calls } = setupPaddleMock()
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
        })

        client.closeCheckout()

        expect(calls['Checkout.close']).toHaveLength(1)
      })

      it('does nothing when Paddle is not loaded', () => {
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
        })

        expect(() => client.closeCheckout()).not.toThrow()
      })
    })

    describe('checkout callbacks', () => {
      function setupWithCallbacks() {
        const { calls } = setupPaddleMock()
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
        })
        client.init()
        const handleEvent = (
          calls['Initialize']![0]![0] as Record<string, unknown>
        ).eventCallback as (d: unknown) => void
        return { client, handleEvent }
      }

      it('calls onCompleted after checkout.completed then checkout.closed', () => {
        const { client, handleEvent } = setupWithCallbacks()
        const completedFn = mock.fn()
        const cancelledFn = mock.fn()

        client.openCheckout(
          { transactionId: 'txn_1' },
          { onCompleted: completedFn, onCancelled: cancelledFn }
        )
        handleEvent({ name: 'checkout.completed' })
        handleEvent({ name: 'checkout.closed' })

        expect(completedFn.mock.callCount()).toBe(1)
        expect(cancelledFn.mock.callCount()).toBe(0)
      })

      it('calls onCancelled when checkout.closed fires without prior checkout.completed', () => {
        const { client, handleEvent } = setupWithCallbacks()
        const completedFn = mock.fn()
        const cancelledFn = mock.fn()

        client.openCheckout(
          { transactionId: 'txn_2' },
          { onCompleted: completedFn, onCancelled: cancelledFn }
        )
        handleEvent({ name: 'checkout.closed' })

        expect(completedFn.mock.callCount()).toBe(0)
        expect(cancelledFn.mock.callCount()).toBe(1)
      })

      it('does not fire callbacks a second time on a repeated checkout.closed', () => {
        const { client, handleEvent } = setupWithCallbacks()
        const completedFn = mock.fn()
        const cancelledFn = mock.fn()

        client.openCheckout(
          { transactionId: 'txn_3' },
          { onCompleted: completedFn, onCancelled: cancelledFn }
        )
        handleEvent({ name: 'checkout.completed' })
        handleEvent({ name: 'checkout.closed' })
        handleEvent({ name: 'checkout.closed' })

        expect(completedFn.mock.callCount()).toBe(1)
        expect(cancelledFn.mock.callCount()).toBe(0)
      })

      it('does not throw when openCheckout is called without callbacks', () => {
        const { client, handleEvent } = setupWithCallbacks()

        client.openCheckout({ transactionId: 'txn_4' })

        expect(() => {
          handleEvent({ name: 'checkout.completed' })
          handleEvent({ name: 'checkout.closed' })
        }).not.toThrow()
      })

      it('still forwards all events to config.eventCallback even when checkout callbacks fire', () => {
        const { calls } = setupPaddleMock()
        const globalEvents: unknown[] = []
        const client = createBillingClientFromConfig({
          token: 'test_token_123',
          eventCallback: (data: unknown) => globalEvents.push(data),
        })
        client.init()
        const handleEvent = (
          calls['Initialize']![0]![0] as Record<string, unknown>
        ).eventCallback as (d: unknown) => void

        const completedFn = mock.fn()
        client.openCheckout(
          { transactionId: 'txn_5' },
          { onCompleted: completedFn }
        )
        handleEvent({ name: 'checkout.completed' })
        handleEvent({ name: 'checkout.closed' })

        expect(globalEvents).toHaveLength(2)
        expect(completedFn.mock.callCount()).toBe(1)
      })
    })
  })
})
