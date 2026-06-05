export interface TextTheme {
  color: boolean
}

function wrap(
  open: string,
  close: string,
  text: string,
  enabled: boolean
): string {
  return enabled ? `${open}${text}${close}` : text
}

export function createTextTheme(theme: TextTheme) {
  return {
    bold(text: string): string {
      return wrap('\u001b[1m', '\u001b[22m', text, theme.color)
    },
    dim(text: string): string {
      return wrap('\u001b[2m', '\u001b[22m', text, theme.color)
    },
    red(text: string): string {
      return wrap('\u001b[31m', '\u001b[39m', text, theme.color)
    },
    yellow(text: string): string {
      return wrap('\u001b[33m', '\u001b[39m', text, theme.color)
    },
    cyan(text: string): string {
      return wrap('\u001b[36m', '\u001b[39m', text, theme.color)
    },
    green(text: string): string {
      return wrap('\u001b[32m', '\u001b[39m', text, theme.color)
    },
  }
}

export function indentLines(lines: readonly string[], indent = '  '): string {
  return lines.map(line => `${indent}${line}`).join('\n')
}
