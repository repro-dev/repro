import { EVAL_JUDGE_MODEL } from '@repro/domain'
import { MAX_TOOL_ITERATIONS } from '../createState'
import { AssistantMessage, Entry, ToolMessage } from '../types'
import type { CritiqueItem } from './introspector'

export interface QualityScores {
  // 1=verbose/padded, 2=acceptable, 3=concise
  brevity: 1 | 2 | 3
  // 1=buries findings in caveats, 3=leads with findings
  directness: 1 | 2 | 3
  // 1=mostly filler, 3=mostly informative content
  signalNoise: 1 | 2 | 3
}

// Safe neutral fallback used when the judge omits or garbles qualityScore
const DEFAULT_QUALITY_SCORES: QualityScores = {
  brevity: 2,
  directness: 2,
  signalNoise: 2,
}

export interface EvalScore {
  // LLM-as-judge: did the agent correctly identify the bug?
  correct: boolean
  // The judge's reasoning for the correct/incorrect decision
  judgeReasoning: string
  // Total tool calls made across all assistant messages
  iterationDepth: number
  // Fraction (0–1) of tool calls that returned an error object
  toolErrorRate: number
  // Whether the iteration limit was hit (MAX_TOOL_ITERATIONS)
  hitIterationLimit: boolean
  // Output quality scores from the judge (independent of correctness)
  qualityScore: QualityScores
  // Per-run critique items produced by --introspect mode (optional)
  critique?: Array<CritiqueItem>
}

// Extracts the final assistant response from an entry list.
// Returns empty string if no assistant message with content is found.
function extractFinalAssistantResponse(entries: Array<Entry>): string {
  let finalResponse = ''
  for (const entry of entries) {
    if (entry.role === 'assistant' && entry.content !== '') {
      finalResponse = entry.content
    }
  }
  return finalResponse
}

// Counts the total number of tool calls across all assistant messages.
function countToolCalls(entries: Array<Entry>): number {
  let total = 0
  for (const entry of entries) {
    if (entry.role === 'assistant') {
      total += (entry as AssistantMessage).toolCalls.length
    }
  }
  return total
}

// Counts the number of tool messages whose content (parsed as JSON) has an
// "error" key — indicating the tool returned an error response.
function countToolErrors(entries: Array<Entry>): number {
  let errors = 0
  for (const entry of entries) {
    if (entry.role === 'tool') {
      const toolMsg = entry as ToolMessage
      if (typeof toolMsg.content === 'string') {
        try {
          const parsed = JSON.parse(toolMsg.content) as unknown
          if (
            parsed !== null &&
            typeof parsed === 'object' &&
            'error' in (parsed as object)
          ) {
            errors++
          }
        } catch {
          // Not JSON — not an error response
        }
      }
    }
  }
  return errors
}

// Checks whether the iteration limit was hit by looking for the sentinel
// message text that buildIterationLimitMessage() produces.
function checkIterationLimitHit(entries: Array<Entry>): boolean {
  for (const entry of entries) {
    if (
      entry.role === 'assistant' &&
      entry.content.includes('iteration limit')
    ) {
      return true
    }
  }
  return false
}

interface JudgeResponse {
  correct: boolean
  reasoning: string
  qualityScore: QualityScores
}

async function callOpenRouterForJudgement(
  finalAssistantResponse: string,
  expectedOutcomeDescription: string,
  apiKey: string
): Promise<JudgeResponse> {
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // gemini-2.5-flash: cheap judge with 1M context window (vs gpt-4o-mini's
        // 128k), better suited for scoring long agent transcripts. See
        // EVAL_JUDGE_MODEL in @repro/domain for full rationale.
        model: EVAL_JUDGE_MODEL,
        stream: false,
        messages: [
          {
            role: 'user',
            content: `You are evaluating an AI debugging agent's response quality.

EXPECTED OUTCOME: ${expectedOutcomeDescription}

AGENT'S FINAL RESPONSE: ${finalAssistantResponse}

Evaluate the response on two independent axes:

1. CORRECTNESS: Did the agent correctly identify the issue described in the expected outcome?

2. OUTPUT QUALITY (score each 1-3, independent of correctness — a concise wrong answer should score high on quality):
   - brevity: 3=appropriately concise with no padding or repetition, 2=acceptable length, 1=verbose with unnecessary preamble/filler
   - directness: 3=leads immediately with the finding, 2=finding is present but somewhat buried, 1=finding is buried under heavy caveats or hedging
   - signalNoise: 3=content is mostly evidence, cause, and recommendation, 2=some filler but mostly informative, 1=mostly filler or restates the obvious

Reply with JSON only (no markdown code fences):
{
  "correct": true/false,
  "reasoning": "...",
  "qualityScore": {
    "brevity": 1|2|3,
    "directness": 1|2|3,
    "signalNoise": 1|2|3
  }
}`,
          },
        ],
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Judge API returned ${response.status}`)
  }

  const body = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  const raw = body.choices[0]?.message?.content ?? '{}'
  // Strip markdown code fences that some models wrap around JSON responses
  // despite the prompt instructing otherwise (e.g. gemini-2.5-flash).
  const content = raw
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim()

  try {
    const parsed = JSON.parse(content) as Partial<JudgeResponse>
    // Validate and normalise qualityScore — fall back to neutral defaults if
    // the judge omits or garbles the field.
    const qualityScore = isValidQualityScores(parsed.qualityScore)
      ? parsed.qualityScore
      : DEFAULT_QUALITY_SCORES
    return {
      correct: parsed.correct ?? false,
      reasoning: parsed.reasoning ?? content,
      qualityScore,
    }
  } catch {
    // Malformed JSON — treat as incorrect, use neutral quality defaults
    return {
      correct: false,
      reasoning: content,
      qualityScore: DEFAULT_QUALITY_SCORES,
    }
  }
}

// Validates that a value is a well-formed QualityScores object with 1|2|3 values.
function isValidQualityScores(v: unknown): v is QualityScores {
  if (v === null || typeof v !== 'object') return false
  const obj = v as Record<string, unknown>
  return (
    isQualityDimension(obj['brevity']) &&
    isQualityDimension(obj['directness']) &&
    isQualityDimension(obj['signalNoise'])
  )
}

function isQualityDimension(v: unknown): v is 1 | 2 | 3 {
  return v === 1 || v === 2 || v === 3
}

export async function scoreEvalRun(
  entries: Array<Entry>,
  expectedOutcomeDescription: string,
  apiKey: string
): Promise<EvalScore> {
  const finalResponse = extractFinalAssistantResponse(entries)
  const totalToolCalls = countToolCalls(entries)
  const totalToolErrors = countToolErrors(entries)
  const hitIterationLimit = checkIterationLimitHit(entries)

  const toolErrorRate =
    totalToolCalls > 0 ? totalToolErrors / totalToolCalls : 0

  // If there's no final response, the agent failed entirely
  if (finalResponse === '') {
    return {
      correct: false,
      judgeReasoning: 'Agent produced no final response',
      iterationDepth: totalToolCalls,
      toolErrorRate,
      hitIterationLimit,
      qualityScore: DEFAULT_QUALITY_SCORES,
    }
  }

  const judgement = await callOpenRouterForJudgement(
    finalResponse,
    expectedOutcomeDescription,
    apiKey
  )

  return {
    correct: judgement.correct,
    judgeReasoning: judgement.reasoning,
    iterationDepth: totalToolCalls,
    toolErrorRate,
    hitIterationLimit,
    qualityScore: judgement.qualityScore,
  }
}

// Re-export MAX_TOOL_ITERATIONS for use in runner/index
export { MAX_TOOL_ITERATIONS }
