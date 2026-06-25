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

  it('passes through "active" unchanged', () => {
    assert.equal(formatSubscriptionStatus('active'), 'active')
  })

  it('converts "canceled" to "cancelled"', () => {
    assert.equal(formatSubscriptionStatus('canceled'), 'cancelled')
  })

  it('passes through "trialing" unchanged (no underscore)', () => {
    assert.equal(formatSubscriptionStatus('trialing'), 'trialing')
  })

  it('replaces underscores with spaces for "past_due"', () => {
    assert.equal(formatSubscriptionStatus('past_due'), 'past due')
  })
})
