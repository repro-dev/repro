import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_MODEL_CONFIG,
  getModelConfig,
  MODEL_CONFIGS,
} from './model-configs'

describe('MODEL_CONFIGS', () => {
  it('contains openai/gpt-5-mini with correct values', () => {
    const config = MODEL_CONFIGS['openai/gpt-5-mini']
    assert.ok(config)
    assert.equal(config.contextWindow, 400_000)
    assert.equal(config.creditMultiplier, 1)
    assert.equal(config.tier, 'base')
  })

  it('contains google/gemini-2.5-flash with correct values', () => {
    const config = MODEL_CONFIGS['google/gemini-2.5-flash']
    assert.ok(config)
    assert.equal(config.contextWindow, 1_000_000)
    assert.equal(config.creditMultiplier, 1)
    assert.equal(config.tier, 'base')
  })

  it('contains openai/o3-mini with correct values', () => {
    const config = MODEL_CONFIGS['openai/o3-mini']
    assert.ok(config)
    assert.equal(config.contextWindow, 200_000)
    assert.equal(config.creditMultiplier, 5)
    assert.equal(config.tier, 'reasoning')
  })

  it('contains google/gemini-2.5-pro with correct values', () => {
    const config = MODEL_CONFIGS['google/gemini-2.5-pro']
    assert.ok(config)
    assert.equal(config.contextWindow, 1_000_000)
    assert.equal(config.creditMultiplier, 5)
    assert.equal(config.tier, 'reasoning')
  })

  it('contains openai/o3 with correct values', () => {
    const config = MODEL_CONFIGS['openai/o3']
    assert.ok(config)
    assert.equal(config.contextWindow, 200_000)
    assert.equal(config.creditMultiplier, 5)
    assert.equal(config.tier, 'reasoning')
  })
})

describe('DEFAULT_MODEL_CONFIG', () => {
  it('has conservative defaults', () => {
    assert.equal(DEFAULT_MODEL_CONFIG.contextWindow, 32_000)
    assert.equal(DEFAULT_MODEL_CONFIG.creditMultiplier, 1)
    assert.equal(DEFAULT_MODEL_CONFIG.tier, 'base')
  })
})

describe('getModelConfig', () => {
  it('returns correct config for known model', () => {
    const config = getModelConfig('openai/gpt-5-mini')
    assert.equal(config.contextWindow, 400_000)
    assert.equal(config.creditMultiplier, 1)
    assert.equal(config.tier, 'base')
  })

  it('returns default config for unknown model', () => {
    const config = getModelConfig('unknown/model-xyz')
    assert.deepEqual(config, DEFAULT_MODEL_CONFIG)
  })

  it('returns reasoning tier for o3', () => {
    const config = getModelConfig('openai/o3')
    assert.equal(config.tier, 'reasoning')
    assert.equal(config.creditMultiplier, 5)
  })
})
