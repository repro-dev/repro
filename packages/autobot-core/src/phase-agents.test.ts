import assert from 'node:assert/strict'
import test from 'node:test'

import {
  autobotPhaseAgentProfiles,
  type AutobotPhaseAgentId,
} from './phase-agents'

test('autobotPhaseAgentProfiles has all 5 entries', () => {
  const expectedIds: AutobotPhaseAgentId[] = [
    'autobot-planner',
    'autobot-developer',
    'autobot-reviewer',
    'autobot-review-fixer',
    'autobot-publisher',
  ]

  for (const id of expectedIds) {
    assert.ok(
      id in autobotPhaseAgentProfiles,
      `expected ${id} to be a key in autobotPhaseAgentProfiles`
    )
  }

  assert.equal(
    Object.keys(autobotPhaseAgentProfiles).length,
    expectedIds.length
  )
})

test('each profile has all required fields present', () => {
  for (const [id, profile] of Object.entries(autobotPhaseAgentProfiles)) {
    assert.ok(profile.agentId, `${id}: agentId is required`)
    assert.ok(profile.description, `${id}: description is required`)
    assert.equal(
      profile.agentId,
      id,
      `${id}: agentId must match the profile key`
    )

    // Verify required fields exist
    assert.ok('read' in profile, `${id}: read is required`)
    assert.ok('write' in profile, `${id}: write is required`)
    assert.ok('edit' in profile, `${id}: edit is required`)
    assert.ok('shell' in profile, `${id}: shell is required`)
    assert.ok('patch' in profile, `${id}: patch is required`)
    assert.ok('publish' in profile, `${id}: publish is required`)
    assert.ok('github' in profile, `${id}: github is required`)
    assert.ok('linear' in profile, `${id}: linear is required`)
  }
})

test('planner profile has edit:false and publish:false', () => {
  const planner = autobotPhaseAgentProfiles['autobot-planner']
  assert.equal(planner.edit, false)
  assert.equal(planner.publish, false)
  assert.equal(planner.patch, false)
})

test('developer profile has edit:true and publish:false', () => {
  const developer = autobotPhaseAgentProfiles['autobot-developer']
  assert.equal(developer.edit, true)
  assert.equal(developer.publish, false)
})

test('reviewer profile has edit:false and publish:false', () => {
  const reviewer = autobotPhaseAgentProfiles['autobot-reviewer']
  assert.equal(reviewer.edit, false)
  assert.equal(reviewer.publish, false)
  assert.equal(reviewer.patch, false)
})

test('review-fixer profile has edit:true and publish:false', () => {
  const fixer = autobotPhaseAgentProfiles['autobot-review-fixer']
  assert.equal(fixer.edit, true)
  assert.equal(fixer.publish, false)
})

test('publisher profile has publish:true and edit:false', () => {
  const publisher = autobotPhaseAgentProfiles['autobot-publisher']
  assert.equal(publisher.publish, true)
  assert.equal(publisher.edit, false)
})
