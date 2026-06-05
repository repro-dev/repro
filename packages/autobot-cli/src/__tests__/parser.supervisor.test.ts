import assert from 'node:assert/strict'
import test from 'node:test'

import { createAutobotProgram } from '../program'
import type { AutobotInvocation } from '../types'
import { collectCommandPaths } from './helpers'

test('supervisor commands are preferred and engine is not registered', () => {
  const program = createAutobotProgram({
    onInvocation(invocation: AutobotInvocation) {
      void invocation
    },
  })
  const help = program.helpInformation()

  const topLevelNames = program.commands.map(command => command.name()).sort()

  assert.ok(topLevelNames.includes('supervisor'))
  assert.equal(topLevelNames.includes('engine'), false)
  assert.match(help, /manage the supervisor/i)
  assert.doesNotMatch(help, /manage the engine/i)

  assert.deepStrictEqual(
    collectCommandPaths(program)
      .filter(path => path.startsWith('supervisor '))
      .sort(),
    [
      'supervisor debug',
      'supervisor debug workflow',
      'supervisor debug workflow diagram',
      'supervisor debug workflow list',
      'supervisor debug workflow validate',
      'supervisor logs',
      'supervisor run-once',
      'supervisor start',
      'supervisor status',
      'supervisor stop',
    ]
  )
})
