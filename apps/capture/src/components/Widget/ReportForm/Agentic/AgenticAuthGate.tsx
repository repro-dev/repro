import { useAuthContext, useSession, useSessionLoading } from '@repro/auth'
import { Button, EmptyState, FullPageLoading } from '@repro/design'
import { forget } from '@repro/future-utils'
import { FolderIcon, LockIcon } from 'lucide-react'
import React, { useEffect } from 'react'
import type { RecordingActions } from '../../CaptureReview/useRecordingActions'
import { Agentic } from './Agentic.hoc'

interface AgenticAuthGateProps {
  getSelectedRecording: RecordingActions['getSelectedRecording']
  hasProjectId: boolean
}

export const AgenticAuthGate: React.FC<AgenticAuthGateProps> = ({
  getSelectedRecording,
  hasProjectId,
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
          Sign in to use AI-powered debugging.
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

  if (!hasProjectId) {
    return (
      <EmptyState>
        <EmptyState.Icon>
          <FolderIcon size={40} />
        </EmptyState.Icon>
        <EmptyState.Title>Choose a workspace project</EmptyState.Title>
        <EmptyState.Description>
          Agentic debugging needs a workspace project. You can still review
          playback or download locally.
        </EmptyState.Description>
      </EmptyState>
    )
  }

  return <Agentic getSelectedRecording={getSelectedRecording} />
}
