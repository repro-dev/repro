import { Atom, createAtom, Setter } from '@repro/atom'
import { RecordingMode } from '@repro/domain'
import { ReadyState } from './types'

export interface State {
  $readyState: Atom<ReadyState>
  $recordingMode: Atom<RecordingMode>
  // projectId and recordingId are set after upload completes so that
  // Controller can fetch the resource map and populate the playback.
  $projectId: Atom<string | null>
  $recordingId: Atom<string | null>
  setReadyState: Setter<ReadyState>
  setRecordingMode: Setter<RecordingMode>
  setProjectId: Setter<string | null>
  setRecordingId: Setter<string | null>
}

const defaultValues = {
  readyState: ReadyState.Idle,
  recordingMode: RecordingMode.None,
  projectId: null as string | null,
  recordingId: null as string | null,
}

export function createState(
  initialValues: Partial<typeof defaultValues> = defaultValues
): State {
  const [$readyState, setReadyState] = createAtom(
    initialValues.readyState ?? defaultValues.readyState
  )

  const [$recordingMode, setRecordingMode] = createAtom(
    initialValues.recordingMode ?? defaultValues.recordingMode
  )

  const [$projectId, setProjectId] = createAtom<string | null>(
    initialValues.projectId ?? defaultValues.projectId
  )

  const [$recordingId, setRecordingId] = createAtom<string | null>(
    initialValues.recordingId ?? defaultValues.recordingId
  )

  return {
    $readyState,
    $recordingMode,
    $projectId,
    $recordingId,
    setReadyState,
    setRecordingMode,
    setProjectId,
    setRecordingId,
  }
}
