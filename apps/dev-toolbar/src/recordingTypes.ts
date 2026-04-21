export type RecordingType =
  | 'dom'
  | 'interaction'
  | 'network'
  | 'console'
  | 'performance'
  | 'state'

const DEFAULT_RECORDING_TYPES: ReadonlyArray<Exclude<RecordingType, 'state'>> =
  ['dom', 'interaction', 'network', 'console', 'performance']

type CreateRecordingTypesOptions = {
  includeState?: boolean
}

export function createRecordingTypes({
  includeState = false,
}: CreateRecordingTypesOptions = {}): Set<RecordingType> {
  const recordingTypes: ReadonlyArray<RecordingType> = includeState
    ? [...DEFAULT_RECORDING_TYPES, 'state']
    : DEFAULT_RECORDING_TYPES

  return new Set<RecordingType>(recordingTypes)
}
