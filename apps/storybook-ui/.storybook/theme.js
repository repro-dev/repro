import { create } from "storybook/theming/create";
import { color, fontFamily } from "@repro/design";

export const theme = create({
  base: "light",

  brandTitle: "Repro Design System",

  fontBase: fontFamily.sans,
  fontCode: fontFamily.mono,

  colorPrimary: color.primary,
  colorSecondary: color.primary,

  appBg: color.bg.subtle,
  appContentBg: color.bg.surface,
  appBorderColor: color.border.default,
  appBorderRadius: 6,

  textColor: color.text.default,
  textInverseColor: color.text.inverse,
  textMutedColor: color.text.muted,

  barTextColor: color.text.secondary,
  barSelectedColor: color.primary,
  barBg: color.bg.surface,

  inputBg: color.bg.surface,
  inputBorder: color.border.default,
  inputTextColor: color.text.default,
  inputBorderRadius: 4,
});
