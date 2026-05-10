import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildBoardColumns,
  getAutobotRoot,
  getIssueLogPaths,
  loadQueue,
  loadTaskLogs,
} from './server'

test('getAutobotRoot honors the explicit env override', () => {
  assert.equal(
    getAutobotRoot('/repo/apps/autobot-board', {
      REPRO_AUTOBOT_ROOT: '/tmp/autobot',
    }),
    path.resolve('/tmp/autobot')
  )
})

test('getAutobotRoot defaults to the repo-local .autobot directory', () => {
  assert.equal(
    getAutobotRoot('/repo/apps/autobot-board', {}),
    path.resolve('/repo/.autobot')
  )
})

test('getIssueLogPaths only returns exact issue-attempt directories', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'autobot-board-'))
  const runs = path.join(root, 'runs')
  mkdirSync(path.join(runs, 'REP-1-attempt-1'), { recursive: true })
  mkdirSync(path.join(runs, 'REP-10-attempt-1'), { recursive: true })
  mkdirSync(path.join(runs, 'REP-1-attempt-2'), { recursive: true })
  writeFileSync(
    path.join(runs, 'REP-1-attempt-1', 'events.jsonl'),
    '{}\n',
    'utf8'
  )
  writeFileSync(
    path.join(runs, 'REP-10-attempt-1', 'events.jsonl'),
    '{}\n',
    'utf8'
  )
  writeFileSync(
    path.join(runs, 'REP-1-attempt-2', 'events.jsonl'),
    '{}\n',
    'utf8'
  )

  assert.deepEqual(getIssueLogPaths(root, 'REP-1'), [
    path.join(runs, 'REP-1-attempt-1', 'events.jsonl'),
    path.join(runs, 'REP-1-attempt-2', 'events.jsonl'),
  ])
})

test('buildBoardColumns groups items by public queue state', () => {
  const columns = buildBoardColumns([
    {
      issue_identifier: 'REP-1',
      state: 'queued',
      workspace_path: '/work/1',
      queued_by: '',
      updated_at: '2026-05-10T12:00:00Z',
      attempt_count: 1,
      last_observed_issue_state_name: '',
      last_observed_issue_state_type: '',
      conditions: [],
    },
    {
      issue_identifier: 'REP-2',
      state: 'running',
      workspace_path: '/work/2',
      queued_by: '',
      updated_at: '2026-05-10T12:05:00Z',
      attempt_count: 2,
      last_observed_issue_state_name: '',
      last_observed_issue_state_type: '',
      conditions: [],
    },
    {
      issue_identifier: 'REP-3',
      state: 'released',
      workspace_path: '/work/3',
      queued_by: '',
      updated_at: '2026-05-10T12:10:00Z',
      attempt_count: 1,
      last_observed_issue_state_name: '',
      last_observed_issue_state_type: '',
      conditions: [],
    },
  ])

  assert.deepEqual(
    columns.map(column => [column.state, column.count]),
    [
      ['queued', 1],
      ['running', 1],
      ['needs_attention', 0],
      ['released', 1],
      ['removed', 0],
    ]
  )
  assert.equal(columns[0]?.items[0]?.issue_identifier, 'REP-1')
})

test('buildBoardColumns orders tasks newest-first within each column', () => {
  const columns = buildBoardColumns([
    {
      issue_identifier: 'REP-1',
      state: 'queued',
      workspace_path: '/work/1',
      queued_by: '',
      updated_at: '2026-05-10T12:00:00Z',
      attempt_count: 1,
      last_observed_issue_state_name: '',
      last_observed_issue_state_type: '',
      conditions: [],
    },
    {
      issue_identifier: 'REP-2',
      state: 'queued',
      workspace_path: '/work/2',
      queued_by: '',
      updated_at: '2026-05-10T12:30:00Z',
      attempt_count: 1,
      last_observed_issue_state_name: '',
      last_observed_issue_state_type: '',
      conditions: [],
    },
    {
      issue_identifier: 'REP-3',
      state: 'queued',
      workspace_path: '/work/3',
      queued_by: '',
      updated_at: '2026-05-10T12:30:00Z',
      attempt_count: 1,
      last_observed_issue_state_name: '',
      last_observed_issue_state_type: '',
      conditions: [],
    },
  ])

  assert.deepEqual(columns[0]?.items.map(item => item.issue_identifier), [
    'REP-3',
    'REP-2',
    'REP-1',
  ])
})

test('loadQueue reports a missing status file before invoking python helpers', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'autobot-board-'))

  assert.throws(
    () => loadQueue(root),
    /Missing autobot status file: .*\/status\.json/
  )
})

test('loadQueue and loadTaskLogs use existing autobot queue helpers', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'autobot-board-'))
  const runs = path.join(root, 'runs')
  const issueRun = path.join(runs, 'REP-1-attempt-1')
  mkdirSync(issueRun, { recursive: true })
  writeFileSync(
    path.join(root, 'status.json'),
    JSON.stringify({
      schema_version: 1,
      items: [
        {
          issue_identifier: 'REP-1',
          claim_state: 'failed',
          workspace_path: '/work/1',
          attempt_count: 1,
          last_error: 'boom',
        },
      ],
      generated_at: '2026-05-10T12:00:00Z',
    }),
    'utf8'
  )
  writeFileSync(path.join(root, 'engine.log'), 'engine line\n', 'utf8')
  writeFileSync(
    path.join(issueRun, 'events.jsonl'),
    JSON.stringify({ kind: 'phase', message: 'started' }) + '\n',
    'utf8'
  )

  const queue = loadQueue(root)
  assert.equal(queue.items[0]?.state, 'needs_attention')
  assert.equal(queue.items[0]?.reason, 'boom')

  const logs = loadTaskLogs(root, 'REP-1')
  assert.deepEqual(logs.engine.lines, ['engine line'])
  assert.equal(logs.issues[0]?.issue_identifier, 'REP-1')
  assert.equal(logs.issues[0]?.lines[0], '{"kind":"phase","message":"started"}')
})
