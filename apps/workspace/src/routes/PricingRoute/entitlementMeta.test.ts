import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getEntitlementMeta } from './entitlementMeta'

const e = (enabled: boolean, limit: number | null) => ({
  feature: 'any',
  enabled,
  limit,
})

describe('getEntitlementMeta — known keys', () => {
  it('recordings: label', () => {
    assert.equal(getEntitlementMeta('recordings').label, 'Recordings')
  })
  it('recordings: description', () => {
    assert.ok(
      getEntitlementMeta('recordings').description.includes('Browser sessions')
    )
  })
  it('recordings: undefined → Not included', () => {
    assert.equal(
      getEntitlementMeta('recordings').valueFormatter(undefined),
      'Not included'
    )
  })
  it('recordings: disabled → Not included', () => {
    assert.equal(
      getEntitlementMeta('recordings').valueFormatter(e(false, 10)),
      'Not included'
    )
  })
  it('recordings: unlimited → Unlimited', () => {
    assert.equal(
      getEntitlementMeta('recordings').valueFormatter(e(true, null)),
      'Unlimited'
    )
  })
  it('recordings: numeric → "10 recordings"', () => {
    assert.equal(
      getEntitlementMeta('recordings').valueFormatter(e(true, 10)),
      '10 recordings'
    )
  })
  it('recordings: numeric → "1 recording" (singular)', () => {
    assert.equal(
      getEntitlementMeta('recordings').valueFormatter(e(true, 1)),
      '1 recording'
    )
  })
  it('recordings: limit 0 → "Not included"', () => {
    assert.equal(
      getEntitlementMeta('recordings').valueFormatter(e(true, 0)),
      'Not included'
    )
  })
  it('seats: numeric → "5 seats"', () => {
    assert.equal(
      getEntitlementMeta('seats').valueFormatter(e(true, 5)),
      '5 seats'
    )
  })
  it('seats: numeric → "1 seat" (singular)', () => {
    assert.equal(
      getEntitlementMeta('seats').valueFormatter(e(true, 1)),
      '1 seat'
    )
  })
  it('ai_credits: numeric → "500 AI credits"', () => {
    assert.equal(
      getEntitlementMeta('ai_credits').valueFormatter(e(true, 500)),
      '500 AI credits'
    )
  })
  it('priority_support: label', () => {
    assert.equal(
      getEntitlementMeta('priority_support').label,
      'Priority Support'
    )
  })
  it('priority_support: enabled → "Included"', () => {
    assert.equal(
      getEntitlementMeta('priority_support').valueFormatter(e(true, null)),
      'Included'
    )
  })
  it('priority_support: disabled → "Not included"', () => {
    assert.equal(
      getEntitlementMeta('priority_support').valueFormatter(e(false, null)),
      'Not included'
    )
  })
})

describe('getEntitlementMeta — unknown key fallback', () => {
  it('label is title-cased', () => {
    assert.equal(getEntitlementMeta('custom_feature').label, 'Custom Feature')
  })
  it('description is empty string', () => {
    assert.equal(getEntitlementMeta('custom_feature').description, '')
  })
  it('numeric → plain number string (no noun)', () => {
    assert.equal(
      getEntitlementMeta('custom_feature').valueFormatter(e(true, 42)),
      '42'
    )
  })
  it('unlimited → Unlimited', () => {
    assert.equal(
      getEntitlementMeta('custom_feature').valueFormatter(e(true, null)),
      'Unlimited'
    )
  })
  it('not included', () => {
    assert.equal(
      getEntitlementMeta('custom_feature').valueFormatter(undefined),
      'Not included'
    )
  })
})
