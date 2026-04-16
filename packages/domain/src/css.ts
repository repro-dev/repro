import { PatchType } from './generated/vdom'

export type Specificity = [number, number, number]

export interface CapturedCSSRule {
  selectorText: string
  declarations: Record<string, string>
  priorities: Record<string, 'important' | ''>
  specificity: Specificity
  stylesheetId: string
  ruleIndex: number
  mediaCondition?: string
  supportsCondition?: string
  isInline: boolean
}

export interface CapturedStyleSheet {
  id: string
  href: string | null
  rules: CapturedCSSRule[]
  inaccessible: boolean
}

export interface StyleSheetMutationPatch {
  type: PatchType.StyleSheetMutation
  stylesheetId: string
  insertedRules?: CapturedCSSRule[]
  deletedRuleIndex?: number
}
