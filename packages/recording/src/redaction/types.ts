export enum PiiCategory {
  Email = 'Email',
  CreditCard = 'CreditCard',
  IBAN = 'IBAN',
  SSN = 'SSN',
  AuthToken = 'AuthToken',
  ApiKey = 'ApiKey',
  Password = 'Password',
  PhoneNumber = 'PhoneNumber',
  IpAddress = 'IpAddress',
  Custom = 'Custom',
}

export interface ValuePatternEntry {
  regex: RegExp
  category: PiiCategory
  validate?: (value: string) => boolean
}

export interface RedactionConfig {
  sensitiveHeaderNames: Set<string>
  sensitiveFieldPatterns: Array<RegExp>
  sensitiveValuePatterns: Array<ValuePatternEntry>
  sensitiveInputTypes: Set<string>
  maskedSelectors: Array<string>
}

export interface DetectionResult {
  detected: boolean
  pattern?: RegExp
  category?: PiiCategory
}

export interface RedactionContract {
  config: RedactionConfig
  isSensitiveKey(key: string): boolean
  detectPii(value: string): DetectionResult
  redactText(value: string): string
  redactValue(value: unknown): unknown
  redactHeaders(headers: Record<string, string>): Record<string, string>
  isSensitiveInputType(inputType: string): boolean
}
