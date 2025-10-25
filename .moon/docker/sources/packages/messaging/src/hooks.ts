import { useContext } from 'react'
import { MessagingContext } from './context'

export function useMessaging() {
  return useContext(MessagingContext)
}
