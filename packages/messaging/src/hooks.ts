import { useContext } from 'react'
import { MessagingContext } from './context'
import { getDefaultAgent } from './defaults'

export function useMessaging() {
  return useContext(MessagingContext) ?? getDefaultAgent()
}
