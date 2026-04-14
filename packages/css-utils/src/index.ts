export { ReferenceStyleProvider, useReferenceStyle } from './reference-styles'
export {
  computeOverrideState,
  extractMediaCondition,
  extractStylesheetRules,
  getAncestorRules,
  matchRulesToElement,
  type CSSStyleDeclarationDict,
  type CapturedCSSRule,
  type InheritedRule,
  type MatchedRule,
} from './rule-matching'
export {
  calculateSpecificity,
  compareSpecificity,
  type Specificity,
} from './specificity'
export { createCSSPropertyMap, createGroupedCSSPropertyMap } from './utils'
export type { CSSPropertyMap, GroupedCSSPropertyMap } from './utils'
