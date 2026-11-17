import assert from 'node:assert/strict'
import test from 'node:test'

import { execute } from '../cli.mjs'

const SELF = {
  id: 'issue-self',
  identifier: 'REP-900',
  title: 'Issue under test',
  url: 'https://linear.app/acme/issue/REP-900',
}

const PROJECT = {
  id: 'project-1',
  name: 'Platform',
  url: 'https://linear.app/acme/project/platform',
  updatedAt: '2026-04-01T00:00:00.000Z',
}

function makeIssue({ project = null, projectMilestone = null }) {
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
    project,
    projectMilestone,
    assignee: null,
    parent: null,
    state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
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

test('issue show --json exposes projectMilestone with name and description alongside milestone', async () => {
  const { payload } = await showJson(
    makeIssue({
      project: PROJECT,
      projectMilestone: {
        id: 'milestone-1',
        name: 'Sprint 1',
        description: 'Ship the inspector fix',
        targetDate: '2026-05-01',
        updatedAt: '2026-04-10T00:00:00.000Z',
        project: PROJECT,
      },
    })
  )

  assert.equal(payload.item.projectMilestone.name, 'Sprint 1')
  assert.equal(
    payload.item.projectMilestone.description,
    'Ship the inspector fix'
  )
  assert.equal(payload.item.milestone.name, 'Sprint 1')
  assert.equal(payload.item.project.name, 'Platform')
})

test('issue show --json sets projectMilestone to null when the issue has no milestone', async () => {
  const { payload } = await showJson(
    makeIssue({ project: PROJECT, projectMilestone: null })
  )

  assert.ok(
    'projectMilestone' in payload.item,
    'projectMilestone key must be present'
  )
  assert.equal(payload.item.projectMilestone, null)
  assert.equal(payload.item.milestone, null)
})

test('issue show --json sets project and projectMilestone to null when the issue has no project', async () => {
  const { payload } = await showJson(
    makeIssue({ project: null, projectMilestone: null })
  )

  assert.equal(payload.item.project, null)
  assert.ok(
    'projectMilestone' in payload.item,
    'projectMilestone key must be present'
  )
  assert.equal(payload.item.projectMilestone, null)
})

test('issue show query selects description on projectMilestone', async () => {
  const { records } = await showJson(makeIssue({}))

  const block = records.graphqlRequests[0].query.match(
    /projectMilestone \{([\s\S]*?)\n\s{8}\}/
  )
  assert.ok(block, 'projectMilestone block not found in query')
  assert.match(block[1], /\bdescription\b/)
})
