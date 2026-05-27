import { color, fontFamily } from '@repro/design'

function createResetRules(rootSelector: string = '') {
  return [
    '* { box-sizing: border-box; }',
    `html, body ${rootSelector ? `, ${rootSelector}` : ''} {
      all: initial;
      margin: 0;
      font-family: ${fontFamily.sans};
      font-size: 10px;
      font-weight: normal;
      line-height: 1em;
      color: ${color.text.default};
      text-align: initial;
    }`,
  ]
}

export function applyResetStyles(
  rootSelector: string,
  styleTarget: HTMLStyleElement
) {
  const sheet = styleTarget.sheet

  if (sheet) {
    for (const rule of createResetRules(rootSelector)) {
      sheet.insertRule(rule, sheet.cssRules.length)
    }
  }
}
