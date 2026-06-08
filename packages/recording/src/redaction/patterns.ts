import { PiiCategory, type ValuePatternEntry } from './types'

export interface FieldPattern {
  regex: RegExp
  fieldNames: Array<string>
  category: PiiCategory
}

// Luhn check for credit card numbers
function luhnCheck(digits: string): boolean {
  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

export const sensitiveFieldPatterns: Array<FieldPattern> = [
  {
    regex: /^(?:authorization|cookie|set-cookie)$/i,
    fieldNames: ['authorization', 'cookie', 'set-cookie'],
    category: PiiCategory.Custom,
  },
  {
    regex: /^(?:password|passwd)$/i,
    fieldNames: ['password', 'passwd'],
    category: PiiCategory.Password,
  },
  {
    regex: /^(?:token|secret)$/i,
    fieldNames: ['token', 'secret'],
    category: PiiCategory.AuthToken,
  },
  {
    regex: /^(?:api[_-]?key)$/i,
    fieldNames: ['api-key', 'api_key', 'apikey'],
    category: PiiCategory.ApiKey,
  },
  {
    regex: /^(?:access[_-]?token)$/i,
    fieldNames: ['access-token', 'access_token', 'accesstoken'],
    category: PiiCategory.AuthToken,
  },
  {
    regex: /^(?:refresh[_-]?token)$/i,
    fieldNames: ['refresh-token', 'refresh_token', 'refreshtoken'],
    category: PiiCategory.AuthToken,
  },
  {
    regex: /^(?:credit[_-]?card|cc[_-]?num)$/i,
    fieldNames: ['credit-card', 'credit_card', 'cc-num', 'cc_num'],
    category: PiiCategory.CreditCard,
  },
  {
    regex: /^(?:ssn|social[_-]?security)$/i,
    fieldNames: ['ssn', 'social-security', 'social_security'],
    category: PiiCategory.SSN,
  },
  {
    regex: /^(?:iban)$/i,
    fieldNames: ['iban'],
    category: PiiCategory.IBAN,
  },
  {
    regex: /^(?:phone|phone[_-]?number|mobile|telephone)$/i,
    fieldNames: [
      'phone',
      'phone-number',
      'phone_number',
      'mobile',
      'telephone',
    ],
    category: PiiCategory.PhoneNumber,
  },
  {
    regex: /^(?:email|e[_-]?mail)$/i,
    fieldNames: ['email', 'e-mail', 'e_mail'],
    category: PiiCategory.Email,
  },
]

export const sensitiveValuePatterns: Array<ValuePatternEntry> = [
  // Email
  {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    category: PiiCategory.Email,
  },
  // Credit card with Luhn check — matches 13-19 digit sequences
  {
    regex: /\b\d{13,19}\b/,
    category: PiiCategory.CreditCard,
  },
  // IBAN (2 letters + 2 digits + up to 30 alphanumeric)
  {
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/,
    category: PiiCategory.IBAN,
  },
  // SSN (XXX-XX-XXXX or XXXXXXXXX with area validation)
  {
    regex: /\b(?!000|666|9\d{2})\d{3}[- ]?\d{2}[- ]?\d{4}\b/,
    category: PiiCategory.SSN,
  },
  // JWT (base64url-encoded header.payload.signature)
  {
    regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    category: PiiCategory.AuthToken,
  },
  // Bearer token (inline in headers or text like "Authorization: Bearer <token>")
  {
    regex: /\bbearer\s+[A-Za-z0-9\-._~+/]+=*\b/i,
    category: PiiCategory.AuthToken,
  },
]

// Export the flat combined mapping for lookup
export const PII_PATTERNS: Array<ValuePatternEntry> = sensitiveValuePatterns

// Luhn check exported for the credit card pattern validation
export function validateCreditCard(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  return luhnCheck(digits)
}
