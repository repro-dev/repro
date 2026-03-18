import { color } from '../tokens/colors'
import {
  fontFamily,
  fontSize,
  lineHeight,
} from '../tokens/typography'
import { radius, shadow } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'

export const TOAST_OFFSET = spacing.xl
export const TOAST_GAP = spacing.md

export const toastStyles = {
  base: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: String(lineHeight.relaxed),
    borderRadius: radius.md,
    boxShadow: shadow.md,
    padding: spacing.xl,
  },
  success: {
    backgroundColor: color.successSubtle,
    borderColor: color.successBorderSubtle,
    color: color.successFg,
  },
  error: {
    backgroundColor: color.dangerSubtle,
    borderColor: color.dangerBorderSubtle,
    color: color.dangerFg,
  },
  warning: {
    backgroundColor: color.warningSubtle,
    borderColor: color.warningBorderSubtle,
    color: color.warningFg,
  },
  info: {
    backgroundColor: color.infoSubtle,
    borderColor: color.infoBorderSubtle,
    color: color.infoFg,
  },
  default: {
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    color: color.text.default,
  },
} as const
