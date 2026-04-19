import { NodeId, NodeType, VElement, VNode, VText, VTree } from '@repro/domain'

export type DiffChangeType =
  | 'added'
  | 'removed'
  | 'attribute_changed'
  | 'text_changed'
  | 'property_changed'

export interface DiffChange {
  type: DiffChangeType
  nodeId: string
  tagName?: string
  summary: string
}

// Truncation threshold -- large diffs are capped and the remainder counted.
const MAX_CHANGES = 50

// Extract tag name from a VNode for use in summaries and change entries.
function getTagName(node: VNode): string | undefined {
  let tagName: string | undefined
  node.apply(n => {
    if (n.type === NodeType.Element) {
      tagName = n.tagName
    }
  })
  return tagName
}

// Produce a short human-readable label for a node (e.g. '<div class="foo">').
function nodeLabel(node: VNode): string {
  let label = ''
  node.apply(n => {
    if (n.type === NodeType.Element) {
      const attrs = Object.entries(n.attributes)
        .filter(([, v]) => v != null)
        .map(([k, v]) => k + '="' + v + '"')
        .join(' ')
      label = attrs
        ? '<' + n.tagName + ' ' + attrs + '>'
        : '<' + n.tagName + '>'
    } else if (n.type === NodeType.Text) {
      label = JSON.stringify(n.value.slice(0, 40))
    }
  })
  return label
}

// Compare two element nodes and emit changes for differing attributes and
// properties. Returns individual DiffChange entries (one per differing key).
function compareElementNodes(
  nodeId: NodeId,
  before: VElement,
  after: VElement
): DiffChange[] {
  const changes: DiffChange[] = []

  // Attribute diffs
  const allAttrKeys = new Set([
    ...Object.keys(before.attributes),
    ...Object.keys(after.attributes),
  ])
  for (const key of allAttrKeys) {
    const bv = before.attributes[key]
    const av = after.attributes[key]
    if (bv !== av) {
      changes.push({
        type: 'attribute_changed',
        nodeId,
        tagName: before.tagName,
        summary:
          'Changed `' +
          before.tagName +
          '` attribute `' +
          key +
          '` from ' +
          JSON.stringify(bv) +
          ' to ' +
          JSON.stringify(av),
      })
    }
  }

  // Property diffs (value, checked, selectedIndex)
  const propKeys: Array<keyof VElement['properties']> = [
    'value',
    'checked',
    'selectedIndex',
  ]
  for (const key of propKeys) {
    const bv = before.properties[key]
    const av = after.properties[key]
    if (bv !== av) {
      changes.push({
        type: 'property_changed',
        nodeId,
        tagName: before.tagName,
        summary:
          'Changed `' +
          before.tagName +
          '` property `' +
          key +
          '` from ' +
          JSON.stringify(bv) +
          ' to ' +
          JSON.stringify(av),
      })
    }
  }

  return changes
}

// Compare two text nodes and emit a change if the text differs.
function compareTextNodes(
  nodeId: NodeId,
  before: VText,
  after: VText
): DiffChange[] {
  if (before.value === after.value) return []
  return [
    {
      type: 'text_changed',
      nodeId,
      summary:
        'Changed text from ' +
        JSON.stringify(before.value.slice(0, 60)) +
        ' to ' +
        JSON.stringify(after.value.slice(0, 60)),
    },
  ]
}

/**
 * Structural diff of two VTrees.
 *
 * Compares nodes by ID across both trees:
 * - IDs present only in `after`  -- "added"
 * - IDs present only in `before` -- "removed"
 * - IDs present in both          -- compare attributes / text / properties
 *
 * Reordering of children is intentionally ignored -- only the node content at
 * each ID is compared, not its position among siblings.
 *
 * Results are truncated to MAX_CHANGES (50); the count of omitted changes is
 * returned in `omittedCount`.
 */
export function diffVTrees(
  before: VTree,
  after: VTree
): { changes: DiffChange[]; omittedCount: number } {
  const allChanges: DiffChange[] = []

  const beforeIds = new Set(Object.keys(before.nodes))
  const afterIds = new Set(Object.keys(after.nodes))

  // Added nodes: present in after but not before
  for (const id of afterIds) {
    if (beforeIds.has(id)) continue
    const node = after.nodes[id]!
    allChanges.push({
      type: 'added',
      nodeId: id,
      tagName: getTagName(node),
      summary: 'Added ' + nodeLabel(node),
    })
  }

  // Removed nodes: present in before but not after
  for (const id of beforeIds) {
    if (afterIds.has(id)) continue
    const node = before.nodes[id]!
    allChanges.push({
      type: 'removed',
      nodeId: id,
      tagName: getTagName(node),
      summary: 'Removed ' + nodeLabel(node),
    })
  }

  // Nodes present in both: compare content
  for (const id of beforeIds) {
    if (!afterIds.has(id)) continue
    const bNode = before.nodes[id]!
    const aNode = after.nodes[id]!

    let bElem: VElement | null = null
    let aElem: VElement | null = null
    let bText: VText | null = null
    let aText: VText | null = null

    bNode.apply(n => {
      if (n.type === NodeType.Element) bElem = n
      else if (n.type === NodeType.Text) bText = n
    })
    aNode.apply(n => {
      if (n.type === NodeType.Element) aElem = n
      else if (n.type === NodeType.Text) aText = n
    })

    if (bElem && aElem) {
      allChanges.push(...compareElementNodes(id, bElem, aElem))
    } else if (bText && aText) {
      allChanges.push(...compareTextNodes(id, bText, aText))
    }
  }

  const omittedCount = Math.max(0, allChanges.length - MAX_CHANGES)
  const changes = allChanges.slice(0, MAX_CHANGES)

  return { changes, omittedCount }
}
