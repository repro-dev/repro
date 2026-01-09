import { createMessagingAgent } from './createMessagingAgent'
import { Agent } from './types'

let DEFAULT_AGENT: Agent

export function getDefaultAgent() {
  DEFAULT_AGENT =
    DEFAULT_AGENT ?? createMessagingAgent({ name: 'default agent' })
  return DEFAULT_AGENT
}
