import { fontSize, lineHeight, spacing } from "@repro/design";

export const TOOL_RESULT_ROW_STYLES = {
  gap: spacing.lg,
  paddingBlockConsole: spacing.md,
  paddingBlockNetwork: spacing.lg,
  paddingInline: spacing.xl,
  borderWidth: 1,
  timeColumnMinWidth: 72,
  timeActionConsoleTop: -3,
  timeActionConsoleLeft: -10,
  rowFontSize: fontSize.xs,
  rowLineHeight: lineHeight.normal,
  actionGap: spacing.sm,
  actionPadding: spacing.sm,
  actionIconSize: 12,
  actionLabelFontSize: fontSize.xs,
  actionOpacityHidden: 0,
  actionOpacityVisible: 1,
  actionLabelSpacing: spacing.sm,
} as const;
