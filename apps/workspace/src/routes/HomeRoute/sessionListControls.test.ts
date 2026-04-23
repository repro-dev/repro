import { RecordingInfo, RecordingMode } from '@repro/domain'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  DEFAULT_SESSION_LIST_SORT_ORDER,
  deriveVisibleSessionRecordings,
  filterSessionRecordings,
  getDefaultSessionListFilters,
  getSessionListFilters,
  isSessionListFilteringActive,
  readSessionListSortOrder,
  resetSessionListControlsForTests,
  SESSION_LIST_SORT_STORAGE_KEY,
  setSessionListFilters,
  sortSessionRecordings,
  writeSessionListSortOrder,
} from './sessionListControls'

const recordings: Array<RecordingInfo> = [
  {
    id: 'rec-alpha',
    title: 'Alpha Recording',
    url: 'https://example.com/alpha',
    description: '',
    mode: RecordingMode.Live,
    duration: 120,
    createdAt: '2026-01-01T00:00:00.000Z',
    browserName: 'Chrome',
    browserVersion: '120',
    operatingSystem: null,
    codecVersion: '1.0.0',
  },
  {
    id: 'rec-beta',
    title: 'Beta Recording',
    url: 'https://example.com/beta',
    description: '',
    mode: RecordingMode.Snapshot,
    duration: 30,
    createdAt: '2026-01-03T00:00:00.000Z',
    browserName: 'Chrome',
    browserVersion: '120',
    operatingSystem: null,
    codecVersion: '1.0.0',
  },
  {
    id: 'rec-gamma',
    title: 'Gamma Recording',
    url: 'https://example.com/gamma',
    description: '',
    mode: RecordingMode.Replay,
    duration: 300,
    createdAt: '2026-01-02T00:00:00.000Z',
    browserName: 'Chrome',
    browserVersion: '120',
    operatingSystem: null,
    codecVersion: '1.0.0',
  },
]

const storageMock = (() => {
  const store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    clear: () => {
      for (const key of Object.keys(store)) {
        delete store[key]
      }
    },
  }
})()

afterEach(() => {
  resetSessionListControlsForTests()
  storageMock.clear()
})

describe('sessionListControls', () => {
  it('defaults to newest-first sort when storage is empty or invalid', () => {
    assert.equal(
      readSessionListSortOrder(storageMock),
      DEFAULT_SESSION_LIST_SORT_ORDER
    )

    storageMock.setItem(SESSION_LIST_SORT_STORAGE_KEY, 'not-a-valid-value')

    assert.equal(
      readSessionListSortOrder(storageMock),
      DEFAULT_SESSION_LIST_SORT_ORDER
    )
  })

  it('round-trips the selected sort order in storage', () => {
    writeSessionListSortOrder(storageMock, 'duration-asc')

    assert.equal(readSessionListSortOrder(storageMock), 'duration-asc')
  })

  it('sorts by created date and duration in both directions', () => {
    assert.deepEqual(
      sortSessionRecordings(recordings, 'createdAt-desc').map(r => r.id),
      ['rec-beta', 'rec-gamma', 'rec-alpha']
    )

    assert.deepEqual(
      sortSessionRecordings(recordings, 'createdAt-asc').map(r => r.id),
      ['rec-alpha', 'rec-gamma', 'rec-beta']
    )

    assert.deepEqual(
      sortSessionRecordings(recordings, 'duration-desc').map(r => r.id),
      ['rec-gamma', 'rec-alpha', 'rec-beta']
    )

    assert.deepEqual(
      sortSessionRecordings(recordings, 'duration-asc').map(r => r.id),
      ['rec-beta', 'rec-alpha', 'rec-gamma']
    )
  })

  it('filters by mode and text across title and URL', () => {
    assert.deepEqual(
      filterSessionRecordings(recordings, {
        searchText: 'gamma',
        selectedModes: [RecordingMode.Replay],
      }).map(r => r.id),
      ['rec-gamma']
    )

    assert.deepEqual(
      filterSessionRecordings(recordings, {
        searchText: 'example.com/beta',
        selectedModes: [],
      }).map(r => r.id),
      ['rec-beta']
    )
  })

  it('persists project filters in session memory', () => {
    setSessionListFilters('project-a', {
      searchText: 'alpha',
      selectedModes: [RecordingMode.Live],
    })

    assert.deepEqual(getSessionListFilters('project-a'), {
      searchText: 'alpha',
      selectedModes: [RecordingMode.Live],
    })

    assert.deepEqual(
      getSessionListFilters('project-b'),
      getDefaultSessionListFilters()
    )
  })

  it('reports active filtering when search or mode chips are selected', () => {
    assert.equal(
      isSessionListFilteringActive(getDefaultSessionListFilters()),
      false
    )

    assert.equal(
      isSessionListFilteringActive({
        searchText: 'alpha',
        selectedModes: [],
      }),
      true
    )
  })

  it('derives visible recordings by filtering before sorting', () => {
    assert.deepEqual(
      deriveVisibleSessionRecordings(recordings, 'duration-desc', {
        searchText: 'recording',
        selectedModes: [RecordingMode.Live, RecordingMode.Replay],
      }).map(r => r.id),
      ['rec-gamma', 'rec-alpha']
    )
  })
})
