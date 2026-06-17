import { noClassnameProp } from './rules/no-classname-prop'
import { noHardcodedColor } from './rules/no-hardcoded-color'
import { noHardcodedSpacing } from './rules/no-hardcoded-spacing'
import { noRawPalette } from './rules/no-raw-palette'

interface PluginRule {
  meta: {
    type: 'problem' | 'suggestion' | 'layout'
    docs: { description: string }
    messages: Record<string, string>
    schema: Record<string, unknown>[]
  }
  create: (context: any) => Record<string, ((node: any) => void) | undefined>
}

interface Plugin {
  meta: { name: string }
  rules: Record<string, PluginRule>
}

const plugin: Plugin = {
  meta: {
    name: '@repro/oxlint-plugin-design',
  },
  rules: {
    'no-hardcoded-color': noHardcodedColor,
    'no-hardcoded-spacing': noHardcodedSpacing,
    'no-raw-palette': noRawPalette,
    'no-classname-prop': noClassnameProp,
  },
}

export = plugin
