import { useAtomValue } from '@repro/atom'
import { useContext } from 'react'
import { AuthContext } from './AuthProvider'
import { GateContext } from './GateProvider'

export function useAuthContext() {
  return useContext(AuthContext)
}

export function useLoginPath() {
  const context = useAuthContext()
  return context.loginPath
}

export function useSession() {
  const context = useAuthContext()
  return useAtomValue(context.$session)
}

export function useSessionLoading() {
  const context = useAuthContext()
  return useAtomValue(context.$sessionLoading)
}

export function useLogin() {
  const context = useAuthContext()
  return context.login
}

export function useLogout() {
  const context = useAuthContext()
  return context.logout
}

export function useResetPassword() {
  const context = useAuthContext()
  return context.resetPassword
}

export function useConfirmPasswordReset() {
  const context = useAuthContext()
  return context.confirmPasswordReset
}

export function useRegister() {
  const context = useAuthContext()
  return context.register
}

export function useAcceptInvitation() {
  const context = useAuthContext()
  return context.acceptInvitation
}

export function useVerifyTotp() {
  const context = useAuthContext()
  return context.verifyTotp
}

export function useHasGate(gate: string) {
  const gates = useContext(GateContext)
  return gates.has(gate)
}
