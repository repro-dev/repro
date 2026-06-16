export type ModelTier = 'base' | 'reasoning'

export interface ModelConfig {
  contextWindow: number
  creditMultiplier: number
  tier: ModelTier
}

// Model selection rationale (reviewed 2026-03-28 against OpenRouter catalogue):
//
// BASE TIER
//
// google/gemini-2.5-flash — current default. Restored after minimax/minimax-m2.7
//   lost function-calling (tool_calls) support through the OpenRouter API. Context
//   window: 1,048,576 tokens. Eval results (2026-03-28, 3 fixtures × 3 runs):
//   100%/67%/100% correctness at ~4.0 avg tool calls — most efficient model
//   tested. Fails 1-in-3 on the hardest fixture (conditional-rendering-bug).
//   Pricing: $0.30/$2.50 per 1M tokens.
//   NOTE: Do not send reasoning.effort to this model — it is not supported and
//   caused premature stopping in earlier eval runs. See streamProvider.ts.
//
// openai/gpt-5-mini — retained as a base-tier option. 400k context, $0.25/$2.00
//   per 1M tokens. Eval results: 67%/100%/100% at ~5.1 avg tool calls. Strong
//   on the hardest fixture; slightly more expensive per session than gemini-2.5-flash
//   due to deeper tool-call chains and 4× smaller context window.
//
// anthropic/claude-haiku-4-5 — added as a base-tier option. 200k context,
//   $1.00/$5.00 per 1M tokens. Eval results: 100%/100%/100% at ~12.6 avg tool
//   calls — the only model to achieve perfect correctness, but at the cost of
//   3× more tool calls than gemini-2.5-flash. Suitable for users who need the
//   highest reliability and don't mind higher token spend.
//
// anthropic/claude-sonnet-4.6 — added as a base-tier calibration option.
//   1M context, $3.00/$15.00 per 1M tokens. Mid-tier frontier model for
//   benchmarking against cheaper alternatives. Not intended as a default
//   candidate due to cost (15× gemini-2.5-flash per session).
//
// google/gemini-3.1-flash-lite — added as a base-tier option. Released
//   May 2026. 1,048,576-token context window (same as 2.5-flash), 65,536 max
//   output tokens. Pricing: $0.25/$1.50 per 1M tokens — cheaper on both
//   input and output vs gemini-2.5-flash at $0.30/$2.50. Supports tool calling
//   and structured outputs. Does NOT support reasoning.effort — the existing
//   guard (modelId.startsWith('openai/')) already handles this correctly.
//
// minimax/minimax-m3 — added as a base-tier option. Released May 2026.
//   1,048,576-token context window. Pricing: $0.30/$1.20 per 1M tokens.
//   ~428B total / ~23B active (MoE). Built with MiniMax Sparse Attention
//   for efficient long-context. Supports tool calling with interleaved
//   thinking between invocations. Does NOT support reasoning.effort — the
//   existing guard (modelId.startsWith('openai/')) already handles this.
//
// minimax/minimax-m2.7 — retained as a registered base-tier option. Previously
//   the default (2026-03-28 to 2026-06-04) due to perfect correctness on all
//   fixtures. Demoted after losing function-calling (tool_calls) support through
//   the OpenRouter API — model returns text responses without tool calls, causing
//   0 tool calls on all eval fixtures. Context: 204,800 tokens. Pricing: $0.30/$1.20
//   per 1M tokens. Retained for monitoring; re-evaluate if OpenRouter restores
//   function-calling support for this model.
//
// deepseek/deepseek-v4-pro — Mixture-of-Experts, 1.6T total / 49B active
//   params. 1,048,576-token context window. Pricing: $0.435/$0.87 per 1M
//   tokens via OpenRouter. Does NOT support reasoning.effort — the existing
//   guard (modelId.startsWith('openai/')) already handles this correctly.
//
// deepseek/deepseek-v4-flash — MoE, 284B total / 13B active params.
//   1,048,576-token context window. Pricing: $0.098/$0.196 per 1M tokens
//   via OpenRouter (30% cheaper on OpenRouter vs direct DeepSeek API).
//   Does NOT support reasoning.effort — same guard as v4-pro above.
//
// xiaomi/mimo-v2.5-pro — added as a base-tier option. Released April 2026.
//   1,048,576-token context window. Pricing: $0.435/$0.87 per 1M tokens.
//   MoE, 1.02T total / 42B active params. Designed and benchmarked for
//   agentic tasks and complex software engineering. Supports tool calling
//   natively; confirmed via official SGLang deployment (--tool-call-parser mimo).
//   Does NOT support reasoning.effort — same guard as v4-pro above.
//
// REASONING TIER
//
// google/gemini-2.5-pro — retained as the primary reasoning-tier option.
//   1,048,576-token context window — unique among reasoning models. Pricing:
//   $1.25/$10.00 per 1M tokens, making it the best-value reasoning model for
//   long multi-step debugging. Strong tool-calling support confirmed.
//
// openai/o4-mini — added as a reasoning-tier option. Supersedes o3-mini at
//   the same $1.10/$4.40 per 1M price point with better performance. 200k
//   context. o3-mini is retained for backwards compatibility (existing user
//   preferences may reference it by name).
//
// openai/o3-mini — retained for backwards compatibility. o4-mini is preferred
//   for new sessions but o3-mini remains available. Same price as o4-mini.
//
// openai/o3 — retained. Higher-capability reasoning model at $2.00/$8.00 per
//   1M tokens. Useful for the most complex multi-step debugging cases.
//
// EVAL MODELS
//
// EVAL_JUDGE_MODEL = gemini-2.5-flash — the judge runs 9+ times per eval run
//   so cost matters. gemini-2.5-flash at $0.30/$2.50 per 1M is more capable
//   than gpt-4o-mini ($0.15/$0.60) and has 8× the context window (1M vs 128k),
//   which is relevant when judging long agent transcripts. The modest cost
//   increase is worth the quality and context headroom.
//
// EVAL_REASONING_MODEL = gemini-2.5-pro — the critic (promptCritic.ts) and
//   introspector (introspector.ts) do higher-order reasoning over transcripts.
//   gemini-2.5-pro at $1.25/$10.00 offers the best combination of reasoning
//   capability, 1M context window, and cost among available options. Previously
//   these used gpt-4o ($2.50/$10.00) which has only 128k context.

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'openai/gpt-5-mini': {
    contextWindow: 400_000,
    creditMultiplier: 1,
    tier: 'base',
  },
  'google/gemini-2.5-flash': {
    contextWindow: 1_048_576,
    creditMultiplier: 1,
    tier: 'base',
  },
  'google/gemini-3.1-flash-lite': {
    contextWindow: 1_048_576,
    creditMultiplier: 1,
    tier: 'base',
  },
  'anthropic/claude-haiku-4-5': {
    contextWindow: 200_000,
    creditMultiplier: 1,
    tier: 'base',
  },
  'anthropic/claude-sonnet-4.6': {
    contextWindow: 1_048_576,
    creditMultiplier: 1,
    tier: 'base',
  },
  'deepseek/deepseek-v4-flash': {
    contextWindow: 1_048_576,
    creditMultiplier: 1,
    tier: 'base',
  },
  'deepseek/deepseek-v4-pro': {
    contextWindow: 1_048_576,
    creditMultiplier: 1,
    tier: 'base',
  },
  'minimax/minimax-m2.7': {
    contextWindow: 204_800,
    creditMultiplier: 1,
    tier: 'base',
  },
  'minimax/minimax-m3': {
    contextWindow: 1_048_576,
    creditMultiplier: 1,
    tier: 'base',
  },
  'xiaomi/mimo-v2.5-pro': {
    contextWindow: 1_048_576,
    creditMultiplier: 1,
    tier: 'base',
  },
  'openai/o3-mini': {
    contextWindow: 200_000,
    creditMultiplier: 5,
    tier: 'reasoning',
  },
  'openai/o4-mini': {
    contextWindow: 200_000,
    creditMultiplier: 5,
    tier: 'reasoning',
  },
  'google/gemini-2.5-pro': {
    contextWindow: 1_048_576,
    creditMultiplier: 5,
    tier: 'reasoning',
  },
  'openai/o3': {
    contextWindow: 200_000,
    creditMultiplier: 5,
    tier: 'reasoning',
  },
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  contextWindow: 32_000,
  creditMultiplier: 1,
  tier: 'base',
}

// Primary model for the agentic session. gemini-2.5-flash restored as default
// after minimax/m2.7 lost function-calling support via OpenRouter. gemini-2.5-flash
// has a 1M context window and achieves the best efficiency (avg ~4.0 tool calls)
// but fails 1-in-3 on the hardest eval fixture. See rationale block above.
export const AGENTIC_DEFAULT_MODEL = 'google/gemini-2.5-flash'

// Cheap judge model for eval scoring. Runs 9+ times per eval run.
// gemini-2.5-flash at $0.30/$2.50 per 1M provides better quality and
// 8× the context of gpt-4o-mini at a modest cost premium.
export const EVAL_JUDGE_MODEL = 'google/gemini-2.5-flash'

// Higher-capability model for eval critic (promptCritic.ts) and introspector
// (introspector.ts). gemini-2.5-pro offers 1M context + strong reasoning
// at $1.25/$10.00 per 1M, better than gpt-4o's 128k context at $2.50/$10.00.
export const EVAL_REASONING_MODEL = 'google/gemini-2.5-pro'

export function getModelConfig(modelId: string): ModelConfig {
  return MODEL_CONFIGS[modelId] ?? DEFAULT_MODEL_CONFIG
}
