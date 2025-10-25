import { memoize } from '@repro/std'

function matches(actual: string, expected: string) {
  return new RegExp(`^${expected}$`, 'i').test(actual)
}

export function isDetachedNode(node: Node) {
  return !node.isConnected
}

export function isDocumentNode(node: Node): node is Document {
  return node.nodeType === Node.DOCUMENT_NODE
}

export function isDocTypeNode(node: Node): node is DocumentType {
  return node.nodeType === Node.DOCUMENT_TYPE_NODE
}

export function isDocumentFragmentNode(node: Node): node is DocumentFragment {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
}

export function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

export function isShadowRoot(node: Node) {
  return isElementNode(node) && node.shadowRoot !== null
}

export function isHTMLElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE && 'style' in node
}

export function isBodyElement(element: Element): element is HTMLBodyElement {
  return matches(element.nodeName, 'body')
}

export function isIFrameElement(
  element: Element
): element is HTMLIFrameElement {
  return matches(element.nodeName, 'iframe')
}

export function isInputElement(node: Node): node is HTMLInputElement {
  return matches(node.nodeName, 'input')
}

export function isSelectElement(node: Node): node is HTMLSelectElement {
  return matches(node.nodeName, 'select')
}

export function isTextAreaElement(node: Node): node is HTMLTextAreaElement {
  return matches(node.nodeName, 'textarea')
}

export function isLocalStylesheet(
  element: Element
): element is HTMLStyleElement {
  return matches(element.nodeName, 'style')
}

export function isExternalStyleSheet(
  element: Element
): element is HTMLLinkElement {
  if (matches(element.nodeName, 'link')) {
    if ((element as HTMLLinkElement).relList.contains('stylesheet')) {
      return true
    }
  }

  return false
}

export function isExternalResource(
  element: Element
): element is HTMLLinkElement {
  return matches(element.nodeName, 'link')
}

export function isScriptElement(
  element: Element
): element is HTMLScriptElement {
  return matches(element.nodeName, 'script')
}

export function isCustomElement(tagName: string) {
  return window.customElements.get(tagName) !== undefined
}

export function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}

export function isCSSImportRule(rule: CSSRule): rule is CSSImportRule {
  return rule.constructor.name === 'CSSImportRule'
}

export const isValidAttributeName = memoize(function isValidAttributeName(
  name: string
) {
  try {
    document.createAttribute(name)
    return true
  } catch {
    return false
  }
})

const inlineEventAttributes = new Set([
  'onabort',
  'onanimationcancel',
  'onanimationend',
  'onanimationiteration',
  'onanimationstart',
  'onauxclick',
  'onblur',
  'oncancel',
  'oncanplay',
  'oncanplaythrough',
  'onchange',
  'onclick',
  'onclose',
  'oncontextmenu',
  'oncuechange',
  'ondblclick',
  'ondrag',
  'ondragend',
  'ondragenter',
  'ondragexit',
  'ondragleave',
  'ondragover',
  'ondragstart',
  'ondrop',
  'ondurationchange',
  'onemptied',
  'onended',
  'onerror',
  'onfocus',
  'ongotpointercapture',
  'oninput',
  'oninvalid',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onload',
  'onloadeddata',
  'onloadedmetadata',
  'onloadstart',
  'onlostpointercapture',
  'onmousedown',
  'onmouseenter',
  'onmouseleave',
  'onmousemove',
  'onmouseout',
  'onmouseover',
  'onmouseup',
  'onpause',
  'onplay',
  'onplaying',
  'onpointercancel',
  'onpointerdown',
  'onpointerenter',
  'onpointerleave',
  'onpointermove',
  'onpointerout',
  'onpointerover',
  'onpointerup',
  'onprogress',
  'onratechange',
  'onreset',
  'onresize',
  'onscroll',
  'onsecuritypolicyviolation',
  'onseeked',
  'onseeking',
  'onselect',
  'onselectionchange',
  'onselectstart',
  'onstalled',
  'onsubmit',
  'onsuspend',
  'ontimeupdate',
  'ontoggle',
  'ontouchcancel',
  'ontouchend',
  'ontouchmove',
  'ontouchstart',
  'ontransitioncancel',
  'ontransitionend',
  'ontransitionrun',
  'ontransitionstart',
  'onvolumechange',
  'onwaiting',
  'onwheel',
])

export function isInlineEventAttribute(name: string) {
  return inlineEventAttributes.has(name)
}

export function maskValue(value: string): string {
  return Array.from(value).fill('*').join('')
}
