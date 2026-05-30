import { Block, InlineBlock } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { color, transition } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { Fragment, useCallback, useState } from 'react'
import { ReadyState, useReadyState, useRecordingMode } from '~/state'
import { CaptureModal } from './CaptureReview/CaptureModal'
import { Launcher } from './Launcher'
import { LiveControls } from './LiveControls'

export const Widget: React.FC = () => {
  const [recordingMode, setRecordingMode] = useRecordingMode()
  const [readyState, setReadyState] = useReadyState()
  const apiClient = useApiClient()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  )
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const projectsResult = useFuture(
    () => apiClient.fetch('/projects'),
    [apiClient, refetchTrigger]
  )
  const projects = projectsResult.success ? projectsResult.data.items : []

  const isReady = readyState === ReadyState.Ready
  const isPendingLiveRecording =
    readyState === ReadyState.Pending && recordingMode === RecordingMode.Live

  const onReset = useCallback(() => {
    setReadyState(ReadyState.Idle)
    setRecordingMode(RecordingMode.None)
  }, [setReadyState, setRecordingMode])

  const onProjectCreated = useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
    setRefetchTrigger(t => t + 1)
  }, [])

  return (
    <Fragment>
      <Block
        position="fixed"
        left={0}
        right={0}
        top={0}
        bottom={0}
        pointerEvents="none"
        borderColor={color.primary}
        borderStyle="solid"
        borderWidth={isPendingLiveRecording ? 5 : 0}
        transition={transition.default}
      />

      {isReady && (
        <Block
          position="fixed"
          top={0}
          right={0}
          bottom={0}
          left={0}
          backgroundColor={color.bg.overlay}
          backdropFilter="blur(5px)"
          props={{ onClick: onReset }}
        />
      )}

      <InlineBlock position="relative" pointerEvents="auto">
        <Launcher />
        {isPendingLiveRecording && <LiveControls />}

        <Block position="relative" translate="20px -90px">
          <CaptureModal
            open={isReady}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onProjectSelect={setSelectedProjectId}
            onProjectCreated={onProjectCreated}
            onClose={onReset}
          />
        </Block>
      </InlineBlock>
    </Fragment>
  )
}
