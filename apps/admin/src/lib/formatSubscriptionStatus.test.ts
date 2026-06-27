import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatSubscriptionStatus } from './formatSubscriptionStatus'

describe('formatSubscriptionStatus', () => {
  it('returns "No subscription" for null', () => {
    assert.equal(formatSubscriptionStatus(null), 'No subscription')
  })

  it('returns "No subscription" for undefined', () => {
    assert.equal(formatSubscriptionStatus(undefined), 'No subscription')
  })

  it('converts "active" to sentence case', () => {
    assert.equal(formatSubscriptionStatus('active'), 'Active')
  })

  it('converts "canceled" to sentence case', () => {
    assert.equal(formatSubscriptionStatus('canceled'), 'Cancelled')
  })

  it('converts "trialing" to sentence case (no underscore)', () => {
    assert.equal(formatSubscriptionStatus('trialing'), 'Trialing')
  })

  it('converts "past_due" to sentence case with spaces', () => {
    assert.equal(formatSubscriptionStatus('past_due'), 'Past due')
  })
})
