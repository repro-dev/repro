import { Block, Grid, Row } from '@jsxstyle/react'
import { useSelector } from '@repro/atom'
import { colors } from '@repro/design'
import { NodeId, VElement, VTree } from '@repro/domain'
import { BreakpointType, usePlayback, useSnapshot } from '@repro/playback'
import { isDocumentVNode, isElementVNode } from '@repro/vdom-utils'
import React, { useCallback, useEffect, useState } from 'react'
import { ElementTree } from '../ElementTree'
import { useElementPicker, useFocusedNode, useSelectedNode } from '../hooks'
import { SelectedNodeComputedStyle } from './SelectedNodeComputedStyle'
import { StylesPane } from './StylesPane'

type SidebarTab = 'styles' | 'computed'

export const ElementsPanel: React.FC = () => {
  return (
    <Grid gridTemplateColumns="1fr auto" alignItems="stretch" height="100%">
      <MainPane />
      <SidebarPane />
    </Grid>
  )
}

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
  const [activeTab, setActiveTab] = useState<SidebarTab>('styles')

  return (
    <Block
      height="100%"
      width={size}
      overflow="auto"
      borderLeft={`1px solid ${colors.slate['200']}`}
    >
      <TabToggle activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'styles' ? <StylesPane /> : <SelectedNodeComputedStyle />}
    </Block>
  )
}

interface TabToggleProps {
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
}

function TabToggle({ activeTab, onTabChange }: TabToggleProps) {
  return (
    <Row
      borderBottom={`1px solid ${colors.slate['200']}`}
      paddingLeft={12}
      paddingRight={12}
      paddingTop={8}
      paddingBottom={8}
      gap={4}
    >
      <TabButton
        active={activeTab === 'styles'}
        onClick={() => onTabChange('styles')}
      >
        Styles
      </TabButton>
      <TabButton
        active={activeTab === 'computed'}
        onClick={() => onTabChange('computed')}
      >
        Computed
      </TabButton>
    </Row>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <Block
      component="button"
      paddingLeft={12}
      paddingRight={12}
      paddingTop={6}
      paddingBottom={6}
      borderRadius={6}
      fontSize={12}
      fontWeight={active ? 600 : 400}
      cursor="pointer"
      backgroundColor={active ? colors.blue['100'] : 'transparent'}
      color={active ? colors.blue['700'] : colors.slate['600']}
      border="none"
      outline="none"
      focusOutline="2px solid #3b82f6"
      focusOutlineOffset="1px"
      onClick={onClick}
      props={{
        type: 'button' as const,
      }}
    >
      {children}
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
