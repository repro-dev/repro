import assert from 'node:assert/strict'
import test from 'node:test'

import { execute } from '../cli.mjs'

const SELF = {
  id: 'issue-self',
  identifier: 'REP-900',
  title: 'Issue under test',
  url: 'https://linear.app/acme/issue/REP-900',
}

const TEAM_STATES = [
  { id: 'state-backlog', name: 'Backlog', type: 'backlog', position: 0 },
  { id: 'state-todo', name: 'Todo', type: 'unstarted', position: 1 },
  { id: 'state-progress', name: 'In Progress', type: 'started', position: 2 },
  { id: 'state-review', name: 'In Review', type: 'started', position: 3 },
  { id: 'state-done', name: 'Done', type: 'completed', position: 4 },
]

function makeIssue({ team }) {
  return {
    id: SELF.id,
    identifier: SELF.identifier,
    title: SELF.title,
    url: SELF.url,
    branchName: 'rep-900-issue-under-test',
    priority: 2,
    priorityLabel: 'High',
    updatedAt: '2026-04-18T00:00:00.000Z',
    description: 'desc',
    project: null,
    projectMilestone: null,
    assignee: null,
    parent: null,
    state: { id: 'state-progress', name: 'In Progress', type: 'started' },
    team,
    labels: { nodes: [] },
    comments: { nodes: [] },
    relations: { nodes: [] },
    inverseRelations: {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  }
}

function makeFixtureClient(issue, records) {
  return {
    client: {
      request: async (query, variables) => {
        records.graphqlRequests.push({ query, variables })
        return { team: { issues: { nodes: [issue] } } }
      },
    },
    teams: async () => ({
      nodes: [{ id: 'team-1', key: 'REP', name: 'Workspace' }],
    }),
  }
}

async function showJson(issue) {
  const records = { graphqlRequests: [] }
  const result = await execute(['issue', 'show', 'REP-900', '--json'], {
    env: { LINEAR_API_KEY: 'api', LINEAR_TEAM: 'REP' },
    clientFactory: async () => makeFixtureClient(issue, records),
  })
  assert.equal(result.code, 0, result.stderr)
  return { payload: JSON.parse(result.stdout), records }
}

test('issue show --json lists every team status with id, name, type and position', async () => {
  const { payload } = await showJson(
    makeIssue({ team: { states: { nodes: TEAM_STATES } } })
  )

  assert.deepEqual(payload.item.team, { states: { nodes: TEAM_STATES } })
})

test('issue show --json lists a single team status', async () => {
  const only = [{ id: 'state-only', name: 'Done', type: 'completed', position: 0 }]
  const { payload } = await showJson(
    makeIssue({ team: { states: { nodes: only } } })
  )

  assert.deepEqual(payload.item.team, { states: { nodes: only } })
})

test('issue show --json sets team to null when the issue has no team', async () => {
  const { payload } = await showJson(makeIssue({ team: null }))

  assert.ok('team' in payload.item, 'team key must be present')
  assert.equal(payload.item.team, null)
})

test('issue show --json keeps the item status key unchanged next to team states', async () => {
  const { payload } = await showJson(
    makeIssue({ team: { states: { nodes: TEAM_STATES } } })
  )

  assert.deepEqual(payload.item.status, {
    id: 'state-progress',
    name: 'In Progress',
    type: 'started',
  })
})

test('issue show query selects team workflow states in the same request', async () => {
  const { records } = await showJson(
    makeIssue({ team: { states: { nodes: TEAM_STATES } } })
  )

  assert.equal(records.graphqlRequests.length, 1)
  const query = records.graphqlRequests[0].query
  const block = query.match(/\n\s{8}team \{([\s\S]*?)\n\s{8}\}/)
  assert.ok(block, 'team block not found on the issue in the query')
  assert.match(block[1], /states\([^)]*\)\s*\{[\s\S]*nodes\s*\{[\s\S]*\bid\b[\s\S]*\bname\b[\s\S]*\btype\b[\s\S]*\bposition\b/)
})
