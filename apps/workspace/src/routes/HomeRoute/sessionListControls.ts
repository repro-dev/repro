import { RecordingInfo, RecordingMode } from '@repro/domain'

export type SessionListSortOrder =
  | 'createdAt-desc'
  | 'createdAt-asc'
  | 'duration-desc'
  | 'duration-asc'

export interface SessionListFilters {
  searchText: string
  selectedModes: RecordingMode[]
}

export const SESSION_LIST_SORT_STORAGE_KEY =
  'repro.workspace.homeRoute.sortOrder'

export const DEFAULT_SESSION_LIST_SORT_ORDER: SessionListSortOrder =
  'createdAt-desc'

export const SESSION_LIST_MODE_OPTIONS = [
  { value: RecordingMode.Snapshot, label: 'Snapshot' },
  { value: RecordingMode.Live, label: 'Live' },
  { value: RecordingMode.Replay, label: 'Replay' },
] as const

export const SESSION_LIST_SORT_OPTIONS = [
  { value: 'createdAt-desc', label: 'Newest first' },
  { value: 'createdAt-asc', label: 'Oldest first' },
  { value: 'duration-desc', label: 'Longest first' },
  { value: 'duration-asc', label: 'Shortest first' },
] as const satisfies ReadonlyArray<{
  value: SessionListSortOrder
  label: string
}>

const sessionFilterStore = new Map<string, SessionListFilters>()

function cloneFilters(filters: SessionListFilters): SessionListFilters {
  return {
    searchText: filters.searchText,
    selectedModes: [...filters.selectedModes],
  }
}

function compareCreatedAt(left: RecordingInfo, right: RecordingInfo): number {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt)
}

function compareDuration(left: RecordingInfo, right: RecordingInfo): number {
  return left.duration - right.duration
}

export function getDefaultSessionListFilters(): SessionListFilters {
  return {
    searchText: '',
    selectedModes: [],
  }
}

export function getSessionListFilters(projectId: string): SessionListFilters {
  return cloneFilters(
    sessionFilterStore.get(projectId) ?? getDefaultSessionListFilters()
  )
}

export function setSessionListFilters(
  projectId: string,
  filters: SessionListFilters
): void {
  sessionFilterStore.set(projectId, cloneFilters(filters))
}

export function resetSessionListControlsForTests(): void {
  sessionFilterStore.clear()
}

export function readSessionListSortOrder(
  storage: Pick<Storage, 'getItem'> | null | undefined
): SessionListSortOrder {
  const value = storage?.getItem(SESSION_LIST_SORT_STORAGE_KEY)

  if (
    value === 'createdAt-desc' ||
    value === 'createdAt-asc' ||
    value === 'duration-desc' ||
    value === 'duration-asc'
  ) {
    return value
  }

  return DEFAULT_SESSION_LIST_SORT_ORDER
}

export function writeSessionListSortOrder(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  sortOrder: SessionListSortOrder
): void {
  storage?.setItem(SESSION_LIST_SORT_STORAGE_KEY, sortOrder)
}

export function isSessionListFilteringActive(
  filters: SessionListFilters
): boolean {
  return filters.searchText.trim() !== '' || filters.selectedModes.length > 0
}

export function sortSessionRecordings(
  recordings: Array<RecordingInfo>,
  sortOrder: SessionListSortOrder
): Array<RecordingInfo> {
  const sorted = [...recordings]

  sorted.sort((left, right) => {
    if (sortOrder === 'createdAt-desc') {
      return compareCreatedAt(right, left)
    }

    if (sortOrder === 'createdAt-asc') {
      return compareCreatedAt(left, right)
    }

    if (sortOrder === 'duration-desc') {
      return compareDuration(right, left)
    }

    return compareDuration(left, right)
  })

  return sorted
}

export function filterSessionRecordings(
  recordings: Array<RecordingInfo>,
  filters: SessionListFilters
): Array<RecordingInfo> {
  const searchText = filters.searchText.trim().toLowerCase()

  return recordings.filter(recording => {
    if (
      filters.selectedModes.length > 0 &&
      !filters.selectedModes.includes(recording.mode)
    ) {
      return false
    }

    if (searchText === '') {
      return true
    }

    return (
      recording.title.toLowerCase().includes(searchText) ||
      recording.url.toLowerCase().includes(searchText)
    )
  })
}

export function deriveVisibleSessionRecordings(
  recordings: Array<RecordingInfo>,
  sortOrder: SessionListSortOrder,
  filters: SessionListFilters
): Array<RecordingInfo> {
  return sortSessionRecordings(
    filterSessionRecordings(recordings, filters),
    sortOrder
  )
}
