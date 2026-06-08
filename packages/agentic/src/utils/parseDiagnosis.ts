import type { DiagnosisContent } from '../types'

/**
 * Parses the model's structured response sections from the assistant message content.
 * The system card instructs the model to use:
 *   ## Diagnosis
 *   ## How we got here
 *   ## Recommendations
 *
 * Returns null if no diagnosis section is found. Tolerates minor formatting
 * variations (e.g. "Diagnosis:" without ##, different newline spacing).
 */
export function parseDiagnosisFromAssistant(
  content: string
): DiagnosisContent | null {
  const diagnosisMatch = content.match(
    /##\s*Diagnosis\s*\r?\n+([\s\S]*?)(?=\n##\s|\r?\n*$)/i
  )
  const inferenceMatch = content.match(
    /##\s*How we got here\s*\r?\n+([\s\S]*?)(?=\n##\s|\r?\n*$)/i
  )
  const recsMatch = content.match(
    /##\s*Recommendations\s*\r?\n+([\s\S]*?)(?=\n##\s|\r?\n*$)/i
  )

  if (!diagnosisMatch?.[1]?.trim()) return null

  const diagnosis = diagnosisMatch[1].trim()
  const inference = inferenceMatch?.[1]?.trim() ?? ''
  const recommendations = recsMatch?.[1]
    ? recsMatch[1]
        .trim()
        .split(/\n/)
        .map(line => line.replace(/^[\s*\d.-]+/, '').trim())
        .filter(Boolean)
    : []

  return { diagnosis, inference, recommendations }
}
