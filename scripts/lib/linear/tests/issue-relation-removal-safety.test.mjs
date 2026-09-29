import assert from 'node:assert/strict'
import test from 'node:test'

import { execute } from '../cli.mjs'

function makeClient({
  relationId = 'relation-1',
  issueMissingAfterDelete = false,
  relationReadFailsAfterDelete = false,
} = {}) {
  const records = { deletedRelations: [], relationPresent: true }
  const team = { id: 'team-1', key: 'REP', name: 'Workspace' }
  const targetIssue = {
    id: 'issue-2',
    identifier: 'REP-876',
    title: 'Target',
  }
  const issue = {
    id: 'issue-1',
    identifier: 'REP-875',
    title: 'Current',
    url: 'https://linear.app/acme/issue/REP-875',
    priority: 3,
    priorityLabel: 'Medium',
    updatedAt: new Date('2026-04-18T00:00:00.000Z'),
    description: '',
    labelIds: [],
    project: null,
    projectMilestone: null,
    assignee: null,
    state: { id: 'state-1', name: 'Todo', type: 'unstarted' },
    relations: async () => {
      if (relationReadFailsAfterDelete && records.deletedRelations.length > 0) {
        throw new Error('relation query unavailable')
      }

      return {
        nodes: records.relationPresent
          ? [
              {
                id: relationId,
                type: 'related',
                issue: Promise.resolve(issue),
                relatedIssue: Promise.resolve(targetIssue),
              },
            ]
          : [],
      }
    },
    inverseRelations: async () => ({ nodes: [] }),
  }

  const client = {
    client: {
      request: async (_query, variables) => {
        const missingAfterDelete =
          issueMissingAfterDelete &&
          records.deletedRelations.length > 0 &&
          variables.number === 875
        const resultIssue = variables.number === 876 ? targetIssue : issue
        return {
          data: {
            team: {
              id: team.id,
              issues: { nodes: missingAfterDelete ? [] : [resultIssue] },
            },
          },
        }
      },
    },
    teams: async () => ({ nodes: [team] }),
    updateIssue: async () => issue,
    deleteIssueRelation: async id => {
      records.deletedRelations.push(id)
      records.relationPresent = false
      return { success: true }
    },
  }

  return { client, records }
}

async function removeRelated(client) {
  return execute(
    ['issue', 'update', 'REP-875', '--remove-related', 'REP-876'],
    {
      env: { LINEAR_API_KEY: 'api', LINEAR_TEAM: 'REP' },
      clientFactory: async () => client,
    }
  )
}

test('issue relation removal refuses to delete a matching edge without an ID', async () => {
  const { client, records } = makeClient({ relationId: null })

  const result = await removeRelated(client)

  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /matching relation has no relation ID/i)
  assert.deepEqual(records.deletedRelations, [])
})

test('issue relation removal fails if the issue cannot be re-read after deletion', async () => {
  const { client, records } = makeClient({ issueMissingAfterDelete: true })

  const result = await removeRelated(client)

  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /could not be re-read/i)
  assert.deepEqual(records.deletedRelations, ['relation-1'])
})

test('issue relation removal fails if relation state cannot be verified after deletion', async () => {
  const { client, records } = makeClient({ relationReadFailsAfterDelete: true })

  const result = await removeRelated(client)

  assert.notEqual(result.code, 0)
  assert.match(
    result.stderr,
    /could not verify removal.*relation query unavailable/i
  )
  assert.deepEqual(records.deletedRelations, ['relation-1'])
})
