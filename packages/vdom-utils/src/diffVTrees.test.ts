import { NodeType, VElement, VText, VTree } from '@repro/domain'
import { Box } from '@repro/tdl'
import expect from 'expect'
import { describe, it } from 'node:test'
import { diffVTrees } from './diffVTrees'

function makeElement(
  id: string,
  tagName: string,
  attrs: Record<string, string | null> = {},
  children: string[] = [],
  parentId: string | null = null,
  props: {
    value?: string | null
    checked?: boolean | null
    selectedIndex?: number | null
  } = {}
): Box<VElement> {
  const elem: VElement = {
    type: NodeType.Element,
    id,
    parentId,
    tagName,
    children,
    attributes: attrs,
    properties: {
      value: props.value ?? null,
      checked: props.checked ?? null,
      selectedIndex: props.selectedIndex ?? null,
    },
    shadowRoot: false,
  }
  return new Box(elem)
}

function makeText(
  id: string,
  value: string,
  parentId: string | null = null
): Box<VText> {
  const text: VText = {
    type: NodeType.Text,
    id,
    parentId,
    value,
  }
  return new Box(text)
}

describe('diffVTrees', () => {
  it('reports no changes for identical trees', () => {
    const tree: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'div', {}, ['2']),
        '2': makeText('2', 'hello', '1'),
      },
    }
    const result = diffVTrees(tree, tree)
    expect(result.changes).toEqual([])
    expect(result.omittedCount).toBe(0)
  })

  it('detects added node', () => {
    const before: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'div', {}, []),
      },
    }
    const after: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'div', {}, ['2']),
        '2': makeElement('2', 'span', {}, [], '1'),
      },
    }
    const result = diffVTrees(before, after)
    expect(result.changes.length).toBe(1)
    expect(result.changes[0]?.type).toBe('added')
    expect(result.changes[0]?.nodeId).toBe('2')
    expect(result.changes[0]?.tagName).toBe('span')
    expect(result.omittedCount).toBe(0)
  })

  it('detects removed node', () => {
    const before: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'div', {}, ['2']),
        '2': makeElement('2', 'span', {}, [], '1'),
      },
    }
    const after: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'div', {}, []),
      },
    }
    const result = diffVTrees(before, after)
    expect(result.changes.length).toBe(1)
    expect(result.changes[0]?.type).toBe('removed')
    expect(result.changes[0]?.nodeId).toBe('2')
    expect(result.changes[0]?.tagName).toBe('span')
    expect(result.omittedCount).toBe(0)
  })

  it('detects attribute change', () => {
    const before: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'div', { class: 'a' }, []),
      },
    }
    const after: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'div', { class: 'b' }, []),
      },
    }
    const result = diffVTrees(before, after)
    expect(result.changes.length).toBe(1)
    expect(result.changes[0]?.type).toBe('attribute_changed')
    expect(result.changes[0]?.nodeId).toBe('1')
    expect(result.changes[0]?.tagName).toBe('div')
    expect(result.changes[0]?.summary).toContain('class')
    expect(result.omittedCount).toBe(0)
  })

  it('detects text change', () => {
    const before: VTree = {
      rootId: '1',
      nodes: {
        '1': makeText('1', 'hello'),
      },
    }
    const after: VTree = {
      rootId: '1',
      nodes: {
        '1': makeText('1', 'world'),
      },
    }
    const result = diffVTrees(before, after)
    expect(result.changes.length).toBe(1)
    expect(result.changes[0]?.type).toBe('text_changed')
    expect(result.changes[0]?.nodeId).toBe('1')
    expect(result.omittedCount).toBe(0)
  })

  it('detects property change', () => {
    const before: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'input', {}, [], null, { value: '' }),
      },
    }
    const after: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'input', {}, [], null, {
          value: 'user@example.com',
        }),
      },
    }
    const result = diffVTrees(before, after)
    expect(result.changes.length).toBe(1)
    expect(result.changes[0]?.type).toBe('property_changed')
    expect(result.changes[0]?.nodeId).toBe('1')
    expect(result.changes[0]?.summary).toContain('value')
    expect(result.omittedCount).toBe(0)
  })

  it('truncates large diffs and reports omittedCount', () => {
    const beforeNodes: VTree['nodes'] = {
      '0': makeElement('0', 'div', {}, []),
    }
    const afterNodes: VTree['nodes'] = {
      '0': makeElement('0', 'div', {}, []),
    }
    for (let i = 1; i <= 60; i++) {
      afterNodes[String(i)] = makeElement(String(i), 'span', {}, [], '0')
    }
    const before: VTree = { rootId: '0', nodes: beforeNodes }
    const after: VTree = { rootId: '0', nodes: afterNodes }
    const result = diffVTrees(before, after)
    expect(result.changes.length).toBe(50)
    expect(result.omittedCount).toBe(10)
  })

  it('does not report reordered children as changes (structural diff)', () => {
    const before: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'ul', {}, ['2', '3']),
        '2': makeElement('2', 'li', {}, [], '1'),
        '3': makeElement('3', 'li', {}, [], '1'),
      },
    }
    const after: VTree = {
      rootId: '1',
      nodes: {
        '1': makeElement('1', 'ul', {}, ['3', '2']),
        '2': makeElement('2', 'li', {}, [], '1'),
        '3': makeElement('3', 'li', {}, [], '1'),
      },
    }
    const result = diffVTrees(before, after)
    expect(result.changes).toEqual([])
    expect(result.omittedCount).toBe(0)
  })
})
