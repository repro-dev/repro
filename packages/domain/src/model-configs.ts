export type ModelTier = 'base' | 'reasoning'

export interface ModelConfig {
  contextWindow: number
  creditMultiplier: number
  tier: ModelTier
}

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'openai/gpt-5-mini': { contextWindow: 400_000, creditMultiplier: 1, tier: 'base' },
  'google/gemini-2.5-flash': { contextWindow: 1_000_000, creditMultiplier: 1, tier: 'base' },
  'openai/o3-mini': { contextWindow: 200_000, creditMultiplier: 5, tier: 'reasoning' },
  'google/gemini-2.5-pro': { contextWindow: 1_000_000, creditMultiplier: 5, tier: 'reasoning' },
  'openai/o3': { contextWindow: 200_000, creditMultiplier: 5, tier: 'reasoning' },
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  contextWindow: 32_000,
  creditMultiplier: 1,
  tier: 'base',
}

export function getModelConfig(modelId: string): ModelConfig {
  return MODEL_CONFIGS[modelId] ?? DEFAULT_MODEL_CONFIG
}
