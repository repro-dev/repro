import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseDiagnosisFromAssistant } from './parseDiagnosis'

describe('parseDiagnosisFromAssistant', () => {
  const fullContent = [
    '## Diagnosis',
    'The form submission failed because the CSRF token expired between page load and submit.',
    '',
    '## How we got here',
    'The user loaded the form page at t=0s, filled in details, and submitted at t=35m. The CSRF token has a 30-minute lifetime, so it had expired by the time the request reached the server.',
    '',
    '## Recommendations',
    '- Increase the CSRF token lifetime to 60 minutes',
    '* Add a token refresh mechanism for long-running forms',
    '',
  ].join('\n')

  it('returns DiagnosisContent with all three sections present', () => {
    const result = parseDiagnosisFromAssistant(fullContent)

    assert(result !== null, 'result should not be null')
    assert.equal(
      result.diagnosis,
      'The form submission failed because the CSRF token expired between page load and submit.'
    )
    assert.equal(
      result.inference,
      'The user loaded the form page at t=0s, filled in details, and submitted at t=35m. The CSRF token has a 30-minute lifetime, so it had expired by the time the request reached the server.'
    )
    assert.deepEqual(result.recommendations, [
      'Increase the CSRF token lifetime to 60 minutes',
      'Add a token refresh mechanism for long-running forms',
    ])
  })

  it('returns null when no ## Diagnosis header found', () => {
    const result = parseDiagnosisFromAssistant(
      'Some random content without proper headers.'
    )
    assert.equal(result, null)
  })

  it('returns diagnosis only when inference and recommendations are missing', () => {
    const content = [
      '## Diagnosis',
      'The root cause is a network timeout.',
    ].join('\n')

    const result = parseDiagnosisFromAssistant(content)

    assert(result !== null, 'result should not be null')
    assert.equal(result.diagnosis, 'The root cause is a network timeout.')
    assert.equal(result.inference, '')
    assert.deepEqual(result.recommendations, [])
  })

  it('strips bullet prefixes from recommendation lines', () => {
    const content = [
      '## Diagnosis',
      'Something broke.',
      '',
      '## Recommendations',
      '- Fix the first thing',
      '* Fix the second thing',
      '3. Fix the third thing',
    ].join('\n')

    const result = parseDiagnosisFromAssistant(content)

    assert(result !== null, 'result should not be null')
    assert.deepEqual(result.recommendations, [
      'Fix the first thing',
      'Fix the second thing',
      'Fix the third thing',
    ])
  })

  it('handles extra whitespace and newlines between sections', () => {
    const content = [
      '## Diagnosis',
      '',
      '',
      'The issue is a race condition.',
      '',
      '## How we got here',
      'Two async operations raced.',
      '',
      '',
      '## Recommendations',
      '- Add a lock',
      '',
      '',
    ].join('\n')

    const result = parseDiagnosisFromAssistant(content)

    assert(result !== null, 'result should not be null')
    assert.equal(result.diagnosis, 'The issue is a race condition.')
    assert.deepEqual(result.recommendations, ['Add a lock'])
  })

  it('handles empty content string -> null', () => {
    assert.equal(parseDiagnosisFromAssistant(''), null)
  })
})
