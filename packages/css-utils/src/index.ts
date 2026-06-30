export { sortCascade } from './cascade-sort'
export type { CascadeSortedRule } from './cascade-sort'
export { INHERITED_PROPERTIES, resolveInheritedProperties } from './inheritance'
export type { InheritanceContext, InheritedProperty } from './inheritance'
export { detectOverrides } from './override-detection'
export type { RuleWithOverrides } from './override-detection'
export { ReferenceStyleProvider, useReferenceStyle } from './reference-styles'
export { matchCSSRules, matchCSSRulesVTree } from './rule-matching'
export type { VTreeContext } from './rule-matching'
export {
  compareSpecificity,
  computeSpecificity,
  getTokenColor,
  tokenizeSelector,
} from './specificity'
export type { SelectorToken } from './specificity'
export {
  createCSSPropertyMap,
  createGroupedCSSPropertyMap,
  getBorder,
  getMargin,
  getPadding,
  hasBorder,
  hasMargin,
  hasPadding,
  resolveValue,
} from './utils'
export type { Box, CSSPropertyMap, GroupedCSSPropertyMap, Side } from './utils'
