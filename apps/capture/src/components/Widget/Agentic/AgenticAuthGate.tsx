import { useAuthContext, useSession, useSessionLoading } from '@repro/auth'
import { Button, EmptyState, FullPageLoading } from '@repro/design'
import { forget } from '@repro/future-utils'
import { LockIcon } from 'lucide-react'
import React, { useEffect } from 'react'
import type { RecordingActions } from '../CaptureReview/useRecordingActions'
import { Agentic } from './Agentic.hoc'

interface AgenticAuthGateProps {
  getSelectedRecording: RecordingActions['getSelectedRecording']
  onInvestigationComplete?: (summary: string) => void
}

export const AgenticAuthGate: React.FC<AgenticAuthGateProps> = ({
  getSelectedRecording,
  onInvestigationComplete,
}) => {
  const sessionLoading = useSessionLoading()
  const session = useSession()
  const context = useAuthContext()

  // Re-check session when the user returns to the tab after logging in
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        forget(context.loadSession())
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [context])

  if (sessionLoading) {
    return <FullPageLoading />
  }

  if (session === null) {
    return (
      <EmptyState>
        <EmptyState.Icon>
          <LockIcon size={40} />
        </EmptyState.Icon>
        <EmptyState.Title>Sign in to Repro</EmptyState.Title>
        <EmptyState.Description>
          Sign in to save recordings and use agentic debugging.
        </EmptyState.Description>
        <EmptyState.Action>
          <Button
            variant="contained"
            onClick={() => {
              window.open(
                `${process.env.REPRO_APP_URL}/account/login`,
                '_blank',
                'noopener,noreferrer'
              )
            }}
          >
            Sign in
          </Button>
        </EmptyState.Action>
      </EmptyState>
    )
  }

  return (
    <Agentic
      getSelectedRecording={getSelectedRecording}
      onInvestigationComplete={onInvestigationComplete}
    />
  )
}
