import { SyntheticId, VTree } from '@repro/domain'
import { isDocumentVNode, isElementVNode, isTextVNode } from './matchers'

export interface A11yNode {
  role: string
  name: string
  children: A11yNode[]
  state?: Record<string, string | boolean>
  value?: string
}

const IMPLICIT_ROLE_MAP: Record<string, string> = {
  a: 'link',
  article: 'article',
  aside: 'complementary',
  button: 'button',
  dialog: 'dialog',
  footer: 'contentinfo',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'banner',
  hr: 'separator',
  img: 'img',
  input: 'textbox',
  li: 'listitem',
  main: 'main',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  progress: 'progressbar',
  section: 'region',
  select: 'combobox',
  table: 'table',
  tbody: 'rowgroup',
  td: 'cell',
  textarea: 'textbox',
  th: 'columnheader',
  thead: 'rowgroup',
  tr: 'row',
  ul: 'list',
}

const INPUT_ROLE_MAP: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  search: 'searchbox',
  submit: 'button',
  reset: 'button',
  button: 'button',
}

const SKIP_TAGS = new Set([
  'script',
  'style',
  'link',
  'meta',
  'noscript',
  'template',
])

function computeRole(
  tagName: string,
  attributes: Record<string, string | null>
): string | null {
  const explicitRole = attributes['role']
  if (explicitRole) {
    return explicitRole
  }

  if (tagName === 'input') {
    const inputType = attributes['type'] ?? 'text'
    return INPUT_ROLE_MAP[inputType] ?? 'textbox'
  }

  return IMPLICIT_ROLE_MAP[tagName] ?? null
}

function collectTextContent(nodeId: SyntheticId, vtree: VTree): string {
  const parts: string[] = []

  function walk(id: SyntheticId) {
    const node = vtree.nodes[id]
    if (!node) return

    if (isTextVNode(node)) {
      const val = node.get('value').orElse('')
      if (val) {
        parts.push(val)
      }
      return
    }

    if (isElementVNode(node)) {
      const children = node.get('children').orElse([])
      for (const childId of children) {
        walk(childId)
      }
    }
  }

  walk(nodeId)

  const text = parts.join(' ').trim()
  return text.length > 100 ? text.slice(0, 100) : text
}

function computeAccessibleName(
  tagName: string,
  attributes: Record<string, string | null>,
  nodeId: SyntheticId,
  vtree: VTree
): string {
  const ariaLabel = attributes['aria-label']
  if (ariaLabel) return ariaLabel

  const alt = attributes['alt']
  if (alt) return alt

  const title = attributes['title']
  if (title) return title

  const placeholder = attributes['placeholder']
  if (placeholder) return placeholder

  if (tagName === 'button' || tagName === 'a') {
    return collectTextContent(nodeId, vtree)
  }

  return ''
}

function computeState(
  attributes: Record<string, string | null>,
  properties: { value: string | null; checked: boolean | null }
): Record<string, string | boolean> | undefined {
  const state: Record<string, string | boolean> = {}

  const ariaDisabled = attributes['aria-disabled']
  if (ariaDisabled === 'true' || ariaDisabled === '') {
    state['disabled'] = true
  } else if (attributes['disabled'] !== undefined && attributes['disabled'] !== null) {
    state['disabled'] = true
  }

  const ariaChecked = attributes['aria-checked']
  if (ariaChecked !== undefined && ariaChecked !== null) {
    state['checked'] = ariaChecked
  } else if (properties.checked === true) {
    state['checked'] = true
  }

  const ariaExpanded = attributes['aria-expanded']
  if (ariaExpanded !== undefined && ariaExpanded !== null) {
    state['expanded'] = ariaExpanded === 'true'
  }

  const ariaSelected = attributes['aria-selected']
  if (ariaSelected !== undefined && ariaSelected !== null) {
    state['selected'] = ariaSelected === 'true'
  }

  const ariaHidden = attributes['aria-hidden']
  if (ariaHidden !== undefined && ariaHidden !== null) {
    state['hidden'] = ariaHidden === 'true'
  }

  const ariaRequired = attributes['aria-required']
  if (ariaRequired !== undefined && ariaRequired !== null) {
    state['required'] = ariaRequired === 'true'
  }

  return Object.keys(state).length > 0 ? state : undefined
}

function processNodeId(nodeId: SyntheticId, vtree: VTree): A11yNode[] {
  const node = vtree.nodes[nodeId]
  if (!node) return []

  if (isDocumentVNode(node)) {
    const children = node.get('children').orElse([])
    const result: A11yNode[] = []
    for (const childId of children) {
      result.push(...processNodeId(childId, vtree))
    }
    return result
  }

  if (!isElementVNode(node)) {
    return []
  }

  const tagName = node.get('tagName').orElse('')
  const attributes = node.get('attributes').orElse({}) as Record<
    string,
    string | null
  >
  const properties = node.get('properties').orElse({
    value: null,
    checked: null,
    selectedIndex: null,
  })

  if (SKIP_TAGS.has(tagName)) {
    return []
  }

  if (attributes['aria-hidden'] === 'true') {
    return []
  }

  const role = computeRole(tagName, attributes)

  if (role === null) {
    const children = node.get('children').orElse([])
    const result: A11yNode[] = []
    for (const childId of children) {
      result.push(...processNodeId(childId, vtree))
    }
    return result
  }

  const name = computeAccessibleName(tagName, attributes, nodeId, vtree)
  const state = computeState(attributes, properties)

  const nodeChildren: A11yNode[] = []
  const childIds = node.get('children').orElse([])
  for (const childId of childIds) {
    nodeChildren.push(...processNodeId(childId, vtree))
  }

  const a11yNode: A11yNode = {
    role,
    name,
    children: nodeChildren,
  }

  if (state) {
    a11yNode.state = state
  }

  const propValue = properties.value
  if (propValue !== null && propValue !== undefined) {
    a11yNode.value = propValue
  }

  return [a11yNode]
}

export function buildA11yTree(vtree: VTree): A11yNode | null {
  const rootNode = vtree.nodes[vtree.rootId]
  if (!rootNode) return null

  const children: A11yNode[] = []

  if (isDocumentVNode(rootNode)) {
    const docChildren = rootNode.get('children').orElse([])
    for (const childId of docChildren) {
      children.push(...processNodeId(childId, vtree))
    }
  } else {
    children.push(...processNodeId(vtree.rootId, vtree))
  }

  return {
    role: 'root',
    name: '',
    children,
  }
}

export function formatA11yTree(root: A11yNode, maxDepth: number = 10): string {
  const lines: string[] = []

  function formatNode(node: A11yNode, depth: number) {
    if (depth > maxDepth) return

    const indent = '  '.repeat(depth)
    const namePart = node.name ? ` "${node.name}"` : ''
    lines.push(`${indent}${node.role}${namePart}`)

    if (node.state && Object.keys(node.state).length > 0) {
      const stateStr = Object.entries(node.state)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')
      lines.push(`${indent}  state: ${stateStr}`)
    }

    if (node.value !== undefined) {
      lines.push(`${indent}  value: "${node.value}"`)
    }

    for (const child of node.children) {
      formatNode(child, depth + 1)
    }
  }

  formatNode(root, 0)
  return lines.join('\n')
}
