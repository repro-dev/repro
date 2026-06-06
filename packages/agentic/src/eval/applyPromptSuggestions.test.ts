import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import {
  applyPromptSuggestionsToSources,
  applyPromptSuggestionToSource,
  loadPromptSuggestions,
} from './applyPromptSuggestions'

function makeSuggestion(
  overrides: Partial<{
    target: string
    currentText: string
    suggestedText: string
    rationale: string
  }> = {}
) {
  return {
    target: 'SHARED_SYSTEM_CARD',
    currentText: 'old text',
    suggestedText: 'new text',
    rationale: 'better clarity',
    ...overrides,
  }
}

describe('loadPromptSuggestions', () => {
  it('returns null when the artifact is missing', () => {
    const missingPath = path.join(
      process.cwd(),
      'tmp',
      `missing-${Date.now()}-${Math.random()}.json`
    )

    assert.equal(loadPromptSuggestions(missingPath), null)
  })

  it('returns an empty array when the artifact contains []', () => {
    const filePath = path.join(
      process.cwd(),
      '..',
      '..',
      'tmp',
      `prompt-suggestions-${Date.now()}-${Math.random()}.json`
    )
    fs.writeFileSync(filePath, '[]\n')

    try {
      assert.deepEqual(loadPromptSuggestions(filePath), [])
    } finally {
      fs.rmSync(filePath, { force: true })
    }
  })
})

describe('applyPromptSuggestionToSource', () => {
  it('replaces the first matching substring only', () => {
    const suggestion = makeSuggestion({
      currentText: 'old',
      suggestedText: 'new',
    })
    const source = [
      'const SHARED_SYSTEM_CARD = `',
      'old middle old',
      '`;',
      '',
      '// System card for the capture extension context.',
      'export const EXTENSION_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `extension`;',
    ].join('\n')
    const result = applyPromptSuggestionToSource(source, suggestion)

    assert.equal(result.applied, true)
    assert.equal(
      result.updatedSource,
      [
        'const SHARED_SYSTEM_CARD = `',
        'new middle old',
        '`;',
        '',
        '// System card for the capture extension context.',
        'export const EXTENSION_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `extension`;',
      ].join('\n')
    )
  })

  it('limits replacements to the targeted prompt export segment', () => {
    const suggestion = makeSuggestion({
      target: 'EXTENSION_SYSTEM_CARD_MESSAGE',
      currentText: 'shared text',
      suggestedText: 'updated text',
    })
    const source = [
      'const SHARED_SYSTEM_CARD = `shared text`;',
      '',
      'export const EXTENSION_SYSTEM_CARD_MESSAGE =',
      '  SHARED_SYSTEM_CARD +',
      '  `',
      'shared text',
      '`',
      '',
      'export const WORKSPACE_SYSTEM_CARD_MESSAGE =',
      '  SHARED_SYSTEM_CARD +',
      '  `',
      'shared text',
      '`',
    ].join('\n')

    const result = applyPromptSuggestionToSource(source, suggestion)

    assert.equal(result.applied, true)
    assert.equal(
      result.updatedSource,
      [
        'const SHARED_SYSTEM_CARD = `shared text`;',
        '',
        'export const EXTENSION_SYSTEM_CARD_MESSAGE =',
        '  SHARED_SYSTEM_CARD +',
        '  `',
        'updated text',
        '`',
        '',
        'export const WORKSPACE_SYSTEM_CARD_MESSAGE =',
        '  SHARED_SYSTEM_CARD +',
        '  `',
        'shared text',
        '`',
      ].join('\n')
    )
  })

  it('falls back to escaped backticks for template literals', () => {
    const suggestion = makeSuggestion({
      currentText: 'Use `backticks` carefully',
      suggestedText: 'Use `code fences` carefully',
    })
    const source = [
      'const SHARED_SYSTEM_CARD = `',
      'Use \\`backticks\\` carefully',
      '`;',
      '',
      'export const EXTENSION_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `extension`;',
    ].join('\n')

    const result = applyPromptSuggestionToSource(source, suggestion)

    assert.equal(result.applied, true)
    assert.equal(
      result.updatedSource,
      [
        'const SHARED_SYSTEM_CARD = `',
        'Use \\`code fences\\` carefully',
        '`;',
        '',
        'export const EXTENSION_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `extension`;',
      ].join('\n')
    )
  })

  it('returns unchanged text when the currentText is not found', () => {
    const result = applyPromptSuggestionToSource(
      'const prompt = `hello`',
      makeSuggestion({ currentText: 'missing', suggestedText: 'new' })
    )

    assert.equal(result.applied, false)
    assert.equal(result.updatedSource, 'const prompt = `hello`')
  })
})

describe('applyPromptSuggestionsToSources', () => {
  it('skips unknown targets and leaves sources unchanged when suggestions are empty', () => {
    const sources = new Map([
      [
        path.resolve(process.cwd(), 'src', 'model', 'system.ts'),
        [
          'const SHARED_SYSTEM_CARD = `shared text`;',
          '',
          '// System card for the capture extension context.',
          'export const EXTENSION_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `extension`;',
        ].join('\n'),
      ],
    ])
    const result = applyPromptSuggestionsToSources(sources, [])

    assert.equal(result.appliedCount, 0)
    assert.equal(result.warnings.length, 0)
    assert.equal(
      result.updatedSources.get(
        path.resolve(process.cwd(), 'src', 'model', 'system.ts')
      ),
      [
        'const SHARED_SYSTEM_CARD = `shared text`;',
        '',
        '// System card for the capture extension context.',
        'export const EXTENSION_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `extension`;',
      ].join('\n')
    )
  })

  it('applies only known targets and reports skipped entries', () => {
    const systemFile = path.resolve(process.cwd(), 'src', 'model', 'system.ts')
    const sources = new Map([
      [
        systemFile,
        [
          'const SHARED_SYSTEM_CARD = `old text`;',
          '',
          '// System card for the capture extension context.',
          'export const EXTENSION_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `extension`;',
          '',
          '// System card for the workspace context.',
          'export const WORKSPACE_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `workspace`;',
        ].join('\n'),
      ],
    ])
    const result = applyPromptSuggestionsToSources(sources, [
      makeSuggestion({ currentText: 'old', suggestedText: 'new' }),
      makeSuggestion({
        target: 'UNKNOWN_TARGET',
        currentText: 'old',
        suggestedText: 'ignored',
      }),
    ])

    assert.equal(result.appliedCount, 1)
    assert.equal(
      result.updatedSources.get(systemFile),
      [
        'const SHARED_SYSTEM_CARD = `new text`;',
        '',
        '// System card for the capture extension context.',
        'export const EXTENSION_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `extension`;',
        '',
        '// System card for the workspace context.',
        'export const WORKSPACE_SYSTEM_CARD_MESSAGE = SHARED_SYSTEM_CARD + `workspace`;',
      ].join('\n')
    )
    assert.ok(
      result.warnings.some(warning => warning.includes('UNKNOWN_TARGET'))
    )
  })
})
