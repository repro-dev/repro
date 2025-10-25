import expect from 'expect'
import Future, { fork, resolve } from 'fluture'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createLoopbackAgent } from './createLoopbackAgent'
import { createMessagePortAgent } from './createMessagePortAgent'

describe('createMessagePortAgent', () => {
  let agentA: ReturnType<typeof createMessagePortAgent>
  let agentB: ReturnType<typeof createMessagePortAgent>

  beforeEach(() => {
    const channel = new MessageChannel()
    agentA = createMessagePortAgent(channel.port1)
    agentB = createMessagePortAgent(channel.port2)
  })

  afterEach(() => {
    agentA.destroy()
    agentB.destroy()
  })

  it('should create an agent with correct properties', () => {
    expect(agentA).toBeDefined()
    expect(agentA.name).toBe('MessagePortAgent')
    expect(typeof agentA.raiseIntent).toBe('function')
    expect(typeof agentA.subscribeToIntent).toBe('function')
    expect(typeof agentA.subscribeToIntentAndForward).toBe('function')
  })

  it('should successfully raise an intent and receive a response', () => {
    return new Promise<void>((done, reject) => {
      const testPayload = { message: 'hello' }
      const testResponse = { result: 'world' }

      const unsubscribe = agentB.subscribeToIntent('test', payload => {
        expect(payload).toEqual(testPayload)
        return resolve(testResponse)
      })

      const future = agentA.raiseIntent<{ result: string }, typeof testPayload>(
        {
          type: 'test',
          payload: testPayload,
        }
      )

      fork((error: Error) => {
        unsubscribe()
        reject(error)
      })((response: any) => {
        try {
          expect(response).toEqual(testResponse)
          unsubscribe()
          done()
        } catch (assertionError) {
          unsubscribe()
          reject(assertionError)
        }
      })(future)
    })
  })

  it('should handle errors from resolvers', () => {
    return new Promise<void>((done, reject) => {
      const errorMessage = 'Test error'

      const unsubscribe = agentB.subscribeToIntent('errorTest', () => {
        return Future(reject => {
          reject(new Error(errorMessage))
          return () => {} // cancellation function
        })
      })

      const future = agentA.raiseIntent({ type: 'errorTest', payload: {} })

      fork((error: Error) => {
        try {
          expect(error).toBeInstanceOf(Error)
          expect(error.message).toBe(errorMessage)
          unsubscribe()
          done()
        } catch (assertionError) {
          unsubscribe()
          reject(assertionError)
        }
      })(() => {
        unsubscribe()
        reject(new Error('Expected error but got response'))
      })(future)
    })
  })

  it('should properly manage subscriptions', () => {
    return new Promise<void>((done, reject) => {
      const resolver1 = () => resolve({ called: false })
      const resolver2 = () => resolve({ called: true })

      const unsubscribe1 = agentB.subscribeToIntent('test', resolver1)

      // Test that we can unsubscribe
      unsubscribe1()

      // After unsubscribing, the resolver should not be called
      const unsubscribe2 = agentB.subscribeToIntent('test', resolver2)

      // The new resolver should be called instead
      const future = agentA.raiseIntent({ type: 'test', payload: {} })

      fork((error: Error) => {
        unsubscribe2()
        reject(error)
      })((response: any) => {
        try {
          expect(response.called).toBe(true)
          unsubscribe2()
          done()
        } catch (assertionError) {
          unsubscribe2()
          reject(assertionError)
        }
      })(future)
    })
  })

  it('should forward intents when using subscribeToIntentAndForward', () => {
    return new Promise<void>((done, reject) => {
      const forwardAgent = createLoopbackAgent()
      const testPayload = { data: 'forward test' }
      const testResponse = { result: 'forwarded' }

      // Set up the forward agent to handle the same intent type
      const forwardUnsubscribe = forwardAgent.subscribeToIntent(
        'testForward',
        payload => {
          expect(payload).toEqual(testPayload)
          return resolve(testResponse)
        }
      )

      // Set up the main agent to forward 'testForward' to the forward agent
      const unsubscribe = agentB.subscribeToIntentAndForward(
        'testForward',
        forwardAgent
      )

      // Raise the intent on the main agent
      const future = agentA.raiseIntent({
        type: 'testForward',
        payload: testPayload,
      })

      fork((error: Error) => {
        unsubscribe()
        forwardUnsubscribe()
        reject(error)
      })((response: any) => {
        try {
          expect(response).toEqual(testResponse)
          unsubscribe()
          forwardUnsubscribe()
          done()
        } catch (assertionError) {
          unsubscribe()
          forwardUnsubscribe()
          reject(assertionError)
        }
      })(future)
    })
  })
})
