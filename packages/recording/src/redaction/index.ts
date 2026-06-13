export { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } from './config'
export {
  PII_PATTERNS,
  sensitiveFieldPatterns,
  sensitiveValuePatterns,
  validateCreditCard,
} from './patterns'
export type { FieldPattern } from './patterns'
export {
  MASKED_VALUE,
  detectPii,
  isSensitiveInputType,
  isSensitiveKey,
  redactHeaders,
  redactText,
  redactValue,
  setRedactionConfig,
} from './redact'
export {
  PiiCategory,
  type DetectionResult,
  type RedactionConfig,
  type RedactionContract,
} from './types'
