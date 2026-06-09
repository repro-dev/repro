import {
  isInputElement,
  isSelectElement,
  isTextAreaElement,
} from '@repro/dom-utils'
import { defaultKeybindingsHandlerIgnore } from 'tinykeys'

export function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  if (defaultKeybindingsHandlerIgnore(event)) return true

  let target = document.activeElement

  if (target?.shadowRoot) {
    target = target.shadowRoot.activeElement
  }

  if (
    target &&
    (isInputElement(target) ||
      isTextAreaElement(target) ||
      isSelectElement(target))
  ) {
    return true
  }

  return false
}
