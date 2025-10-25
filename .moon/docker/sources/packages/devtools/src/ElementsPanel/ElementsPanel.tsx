import { Block, Grid } from '@jsxstyle/react'
import { useSelector } from '@repro/atom'
import { colors } from '@repro/design'
import { NodeId, VElement, VTree } from '@repro/domain'
import { BreakpointType, usePlayback, useSnapshot } from '@repro/playback'
import { isDocumentVNode, isElementVNode } from '@repro/vdom-utils'
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { ElementTree } from '../ElementTree'
import { useElementPicker, useFocusedNode, useSelectedNode } from '../hooks'
import { SelectedNodeComputedStyle } from './SelectedNodeComputedStyle'

export const ElementsPanel: React.FC = () => {
  return (
    <Container>
      <MainPane />
      <SidebarPane />
    </Container>
  )
}

const Container: React.FC<PropsWithChildren> = ({ children }) => (
  <Grid gridTemplateColumns="1fr auto" alignItems="stretch" height="100%">
    {children}
  </Grid>
)

const MainPane: React.FC = React.memo(() => {
  const [focusedNode, setFocusedNode] = useFocusedNode()
  const [selectedNode, setSelectedNode] = useSelectedNode()
  const [picker] = useElementPicker()
  const snapshot = useSnapshot()
  const playback = usePlayback()

  const breakpointNodes = useSelector(
    playback.$breakpoints,
    breakpoints =>
      new Set(
        breakpoints
          .filter(breakpoint => breakpoint.type === BreakpointType.VNode)
          .map(breakpoint => breakpoint.nodeId)
      )
  )

  const activeBreakpointNode = useSelector(
    playback.$activeBreakpoint,
    activeBreakpoint => {
      if (activeBreakpoint && activeBreakpoint.type === BreakpointType.VNode) {
        return activeBreakpoint.nodeId
      }

      return null
    }
  )

  useEffect(() => {
    setSelectedNode(selectedNode => {
      const vtree = snapshot.dom

      if (vtree) {
        if (selectedNode && vNodeExists(vtree, selectedNode)) {
          return selectedNode
        }

        const bodyElement = vtree ? getBodyVElement(vtree) : null

        if (bodyElement) {
          return bodyElement.id
        }
      }

      return null
    })
  }, [setSelectedNode, snapshot.dom])

  const handleToggleBreakpoint = useCallback(
    (nodeId: NodeId) => {
      const breakpoints = playback.getBreakpoints()

      const breakpoint = breakpoints.find(
        breakpoint =>
          breakpoint.type === BreakpointType.VNode &&
          breakpoint.nodeId === nodeId
      )

      if (breakpoint) {
        playback.removeBreakpoint(breakpoint)
      } else {
        playback.addBreakpoint({
          type: BreakpointType.VNode,
          nodeId,
        })
      }
    },
    [playback]
  )

  return (
    <Block height="100%" overflow="auto">
      {snapshot.dom && (
        <ElementTree
          vtree={snapshot.dom}
          focusedNode={focusedNode}
          selectedNode={selectedNode}
          breakpointNodes={breakpointNodes}
          activeBreakpointNode={activeBreakpointNode}
          onFocusNode={setFocusedNode}
          onSelectNode={setSelectedNode}
          onToggleBreakpoint={handleToggleBreakpoint}
          usingPicker={picker}
        />
      )}
    </Block>
  )
})

const INITIAL_SIDEBAR_SIZE = 360

const SidebarPane: React.FC = () => {
  const [size, _setSize] = useState(INITIAL_SIDEBAR_SIZE)
  const [_initialSize, _setInitialSize] = useState(INITIAL_SIDEBAR_SIZE)

  return (
    <Block
      height="100%"
      width={size}
      overflow="auto"
      borderLeft={`1px solid ${colors.slate['200']}`}
    >
      <SelectedNodeComputedStyle />
    </Block>
  )
}

function getBodyVElement(vtree: VTree): VElement | null {
  const rootNode = vtree.nodes[vtree.rootId]

  if (!rootNode || !isDocumentVNode(rootNode)) {
    return null
  }

  const documentElementNode = rootNode.flatMap(rootNode =>
    rootNode.children
      .map(childId => vtree.nodes[childId])
      .find(
        node =>
          node &&
          isElementVNode(node) &&
          node.match(node => node.tagName === 'html')
      )
  )

  if (!documentElementNode || !isElementVNode(documentElementNode)) {
    return null
  }

  const bodyNode = documentElementNode.flatMap(documentElementNode =>
    documentElementNode.children
      .map(childId => vtree.nodes[childId])
      .find(
        node =>
          node &&
          isElementVNode(node) &&
          node.match(node => node.tagName === 'body')
      )
  )

  if (!bodyNode || !isElementVNode(bodyNode)) {
    return null
  }

  return bodyNode.orElse(null)
}

function vNodeExists(vtree: VTree, nodeId: string): boolean {
  return !!vtree.nodes[nodeId]
}
