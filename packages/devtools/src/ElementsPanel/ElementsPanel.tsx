import { Block, Col, Grid, Row } from '@jsxstyle/react'
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

export const ElementsPanel: React.FC = () => {
  return (
    <Container>
      <MainPane />
      <SidebarPane />
    </Container>
  )
}

const Container: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
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

type SidebarTab = 'styles' | 'computed'

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
      <Col height="100%">
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <Block flex="1" overflow="auto">
          <Block
            id="sidebar-panel-styles"
            props={{ role: 'tabpanel', hidden: activeTab !== 'styles' }}
          >
            {activeTab === 'styles' && <StylesPane />}
          </Block>
          <Block
            id="sidebar-panel-computed"
            props={{ role: 'tabpanel', hidden: activeTab !== 'computed' }}
          >
            {activeTab === 'computed' && <SelectedNodeComputedStyle />}
          </Block>
        </Block>
      </Col>
    </Block>
  )
}

interface TabBarProps {
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
}

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => (
  <Row
    borderBottom={`1px solid ${colors.slate['200']}`}
    backgroundColor={colors.slate['50']}
    flexShrink={0}
    props={{ role: 'tablist' }}
  >
    <TabButton
      label="Styles"
      tab="styles"
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
    <TabButton
      label="Computed"
      tab="computed"
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
  </Row>
)

interface TabButtonProps {
  label: string
  tab: SidebarTab
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
}

const TabButton: React.FC<TabButtonProps> = ({
  label,
  tab,
  activeTab,
  onTabChange,
}) => {
  const isActive = tab === activeTab

  return (
    <Block
      component="button"
      padding="6px 12px"
      fontSize={11}
      fontWeight={isActive ? 600 : 400}
      color={isActive ? colors.blue['600'] : colors.slate['600']}
      backgroundColor="transparent"
      borderBottom={
        isActive ? `2px solid ${colors.blue['500']}` : '2px solid transparent'
      }
      cursor="pointer"
      outline="none"
      border="none"
      borderBottomStyle="solid"
      borderBottomWidth={2}
      borderBottomColor={isActive ? colors.blue['500'] : 'transparent'}
      hoverBackgroundColor={colors.slate['100']}
      props={{
        role: 'tab',
        'aria-selected': isActive,
        'aria-controls': `sidebar-panel-${tab}`,
        onClick: () => onTabChange(tab),
      }}
    >
      {label}
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
