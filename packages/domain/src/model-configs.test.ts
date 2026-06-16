import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AGENTIC_DEFAULT_MODEL,
  DEFAULT_MODEL_CONFIG,
  EVAL_JUDGE_MODEL,
  EVAL_REASONING_MODEL,
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
    assert.equal(config.contextWindow, 1_048_576)
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
    assert.equal(config.contextWindow, 1_048_576)
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

  it('contains openai/o4-mini with correct values', () => {
    const config = MODEL_CONFIGS['openai/o4-mini']
    assert.ok(config)
    assert.equal(config.contextWindow, 200_000)
    assert.equal(config.creditMultiplier, 5)
    assert.equal(config.tier, 'reasoning')
  })

  it('contains minimax/minimax-m3 with correct values', () => {
    const config = MODEL_CONFIGS['minimax/minimax-m3']
    assert.ok(config)
    assert.equal(config.contextWindow, 1_048_576)
    assert.equal(config.creditMultiplier, 1)
    assert.equal(config.tier, 'base')
  })

  it('contains xiaomi/mimo-v2.5-pro with correct values', () => {
    const config = MODEL_CONFIGS['xiaomi/mimo-v2.5-pro']
    assert.ok(config)
    assert.equal(config.contextWindow, 1_048_576)
    assert.equal(config.creditMultiplier, 1)
    assert.equal(config.tier, 'base')
  })

  it('contains google/gemini-3.1-flash-lite with correct values', () => {
    const config = MODEL_CONFIGS['google/gemini-3.1-flash-lite']
    assert.ok(config)
    assert.equal(config.contextWindow, 1_048_576)
    assert.equal(config.creditMultiplier, 1)
    assert.equal(config.tier, 'base')
  })

  it('contains anthropic/claude-haiku-4-5 with correct values', () => {
    const config = MODEL_CONFIGS['anthropic/claude-haiku-4-5']
    assert.ok(config)
    assert.equal(config.contextWindow, 200_000)
    assert.equal(config.creditMultiplier, 1)
    assert.equal(config.tier, 'base')
  })

  it('contains deepseek/deepseek-v4-pro with correct values', () => {
    const config = MODEL_CONFIGS['deepseek/deepseek-v4-pro']
    assert.ok(config)
    assert.equal(config.contextWindow, 1_048_576)
    assert.equal(config.creditMultiplier, 1)
    assert.equal(config.tier, 'base')
  })

  it('contains deepseek/deepseek-v4-flash with correct values', () => {
    const config = MODEL_CONFIGS['deepseek/deepseek-v4-flash']
    assert.ok(config)
    assert.equal(config.contextWindow, 1_048_576)
    assert.equal(config.creditMultiplier, 1)
    assert.equal(config.tier, 'base')
  })
})

describe('exported model constants', () => {
  it('AGENTIC_DEFAULT_MODEL is gemini-2.5-flash', () => {
    assert.equal(AGENTIC_DEFAULT_MODEL, 'google/gemini-2.5-flash')
  })

  it('EVAL_JUDGE_MODEL is gemini-2.5-flash', () => {
    assert.equal(EVAL_JUDGE_MODEL, 'google/gemini-2.5-flash')
  })

  it('EVAL_REASONING_MODEL is gemini-2.5-pro', () => {
    assert.equal(EVAL_REASONING_MODEL, 'google/gemini-2.5-pro')
  })

  it('AGENTIC_DEFAULT_MODEL has a registered config', () => {
    const config = MODEL_CONFIGS[AGENTIC_DEFAULT_MODEL]
    assert.ok(config, 'default model must have a registered config')
  })

  it('EVAL_JUDGE_MODEL has a registered config', () => {
    const config = MODEL_CONFIGS[EVAL_JUDGE_MODEL]
    assert.ok(config, 'judge model must have a registered config')
  })

  it('EVAL_REASONING_MODEL has a registered config', () => {
    const config = MODEL_CONFIGS[EVAL_REASONING_MODEL]
    assert.ok(config, 'reasoning model must have a registered config')
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
