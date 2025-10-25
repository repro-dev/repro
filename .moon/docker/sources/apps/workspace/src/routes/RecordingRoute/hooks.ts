import { useContext } from 'react'
import { NavigationContext } from './context'

export function useNavigate() {
  return useContext(NavigationContext)
}
