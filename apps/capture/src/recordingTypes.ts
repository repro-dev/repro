export type RecordingType =
  | 'dom'
  | 'interaction'
  | 'network'
  | 'console'
  | 'performance'
  | 'state'

export type RuntimeInstalledType =
  | 'console'
  | 'custom'
  | 'network'
  | 'performance'

const DEFAULT_RECORDING_TYPES: ReadonlyArray<Exclude<RecordingType, 'state'>> =
  ['dom', 'interaction', 'network', 'console', 'performance']

type CreateRecordingTypesOptions = {
  includeState?: boolean
  runtimeInstalledTypes?: Set<RuntimeInstalledType>
}

export function createRecordingTypes({
  includeState = false,
  runtimeInstalledTypes = new Set<RuntimeInstalledType>(),
}: CreateRecordingTypesOptions = {}): Set<RecordingType> {
  const recordingTypes: ReadonlyArray<RecordingType> = includeState
    ? [...DEFAULT_RECORDING_TYPES, 'state']
    : DEFAULT_RECORDING_TYPES

  return new Set<RecordingType>(
    recordingTypes.filter(
      type => !runtimeInstalledTypes.has(type as RuntimeInstalledType)
    )
  )
}
