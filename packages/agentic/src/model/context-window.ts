import { getModelConfig } from '@repro/domain'

const CURRENT_TURN_RESERVE = 4_000
const SAFETY_FACTOR = 0.9

export function computeContextBudget(
  modelId: string,
  systemPromptTokens: number
): number {
  const config = getModelConfig(modelId)
  return (
    Math.floor(config.contextWindow * SAFETY_FACTOR) -
    systemPromptTokens -
    CURRENT_TURN_RESERVE
  )
}

export function truncateToContextBudget<T>(
  messages: T[],
  budget: number,
  estimateMessage: (msg: T) => number
): T[] {
  let tokenCount = 0
  let startIndex = messages.length

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateMessage(messages[i] as T)
    if (tokenCount + tokens > budget) {
      startIndex = i + 1
      break
    }
    tokenCount += tokens
    startIndex = i
  }

  return messages.slice(startIndex)
}
