import expect from 'expect'
import Future, { fork } from 'fluture'
import { describe, it, beforeEach } from 'node:test'
import { createPTPAgent } from './createPTPAgent'

describe('createPTPAgent', () => {
  let agent: ReturnType<typeof createPTPAgent>
  
  beforeEach(() => {
    agent = createPTPAgent()
  })
  
  it('should create an agent with correct properties', () => {
    expect(agent).toBeDefined()
    expect(agent.name).toBe('PTPAgent')
    expect(typeof agent.raiseIntent).toBe('function')
    expect(typeof agent.subscribeToIntent).toBe('function')
    expect(typeof agent.subscribeToIntentAndForward).toBe('function')
  })
  
  it('should successfully raise an intent and receive a response', (done) => {
    const testPayload = { message: 'hello' }
    const testResponse = { result: 'world' }
    
    const unsubscribe = agent.subscribeToIntent('test', (payload) => {
      expect(payload).toEqual(testPayload)
      return Future.of(testResponse)
    })
    
    const future = agent.raiseIntent<{ result: string }, typeof testPayload>({
      type: 'test',
      payload: testPayload
    })
    
    fork(
      (error) => {
        unsubscribe()
        done(error)
      }
    )(
      (response) => {
        expect(response).toEqual(testResponse)
        unsubscribe()
        done()
      }
    )(future)
  })
  
  it('should handle errors from resolvers', (done) => {
    const errorMessage = 'Test error'
    
    const unsubscribe = agent.subscribeToIntent('errorTest', () => {
      return Future.reject(new Error(errorMessage))
    })
    
    const future = agent.raiseIntent({ type: 'errorTest', payload: {} })
    
    fork(
      (error) => {
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toBe(errorMessage)
        unsubscribe()
        done()
      }
    )(
      (response) => {
        unsubscribe()
        done(new Error('Expected error but got response'))
      }
    )(future)
  })
  
  it('should properly manage subscriptions', (done) => {
    const resolver1 = () => Future.of({ called: false })
    const resolver2 = () => Future.of({ called: true })
    
    const unsubscribe1 = agent.subscribeToIntent('test', resolver1)
    
    // Test that we can unsubscribe
    unsubscribe1()
    
    // After unsubscribing, the resolver should not be called
    const unsubscribe2 = agent.subscribeToIntent('test', resolver2)
    
    // The new resolver should be called instead
    const future = agent.raiseIntent({ type: 'test', payload: {} })
    
    fork(
      (error) => {
        unsubscribe2()
        done(error)
      }
    )(
      (response) => {
        expect((response as any).called).toBe(true)
        unsubscribe2()
        done()
      }
    )(future)
  })
  
  it('should forward intents when using subscribeToIntentAndForward', (done) => {
    const forwardAgent = createPTPAgent()
    const testPayload = { data: 'forward test' }
    const testResponse = { result: 'forwarded' }
    
    // Set up the forward agent to handle the intent
    const forwardUnsubscribe = forwardAgent.subscribeToIntent('forwardTest', (payload) => {
      expect(payload).toEqual(testPayload)
      return Future.of(testResponse)
    })
    
    // Set up the main agent to forward this intent
    const unsubscribe = agent.subscribeToIntentAndForward('forwardTest', forwardAgent)
    
    // Raise the intent on the main agent
    const future = agent.raiseIntent({ type: 'forwardTest', payload: testPayload })
    
    fork(
      (error) => {
        unsubscribe()
        forwardUnsubscribe()
        done(error)
      }
    )(
      (response) => {
        expect(response).toEqual(testResponse)
        unsubscribe()
        forwardUnsubscribe()
        done()
      }
    )(future)
  })
})