import { NodeId, VTree } from '@repro/domain'
import React, { useCallback, useContext } from 'react'

export const VTreeContext = React.createContext<VTree | null>(null)

export type Tag = 'open' | 'close'

export interface NodeState {
  focusedNode: NodeId | null
  focusedNodeTag: Tag
  onFocusNode: (nodeId: NodeId, tag: Tag) => void

  selectedNode: NodeId | null
  selectedNodeTag: Tag
  onSelectNode: (nodeId: NodeId, tag: Tag) => void

  visibleNodes: Set<NodeId>
  onToggleNodeVisibility: (nodeId: NodeId) => void

  breakpointNodes: Set<NodeId>
  onToggleBreakpoint: (nodeId: NodeId) => void
}

export const NodeStateContext = React.createContext<NodeState>({
  focusedNode: null,
  focusedNodeTag: 'open',
  onFocusNode() {},
  selectedNode: null,
  selectedNodeTag: 'open',
  onSelectNode() {},
  visibleNodes: new Set(),
  onToggleNodeVisibility() {},
  breakpointNodes: new Set(),
  onToggleBreakpoint() {},
})

export function useNode(nodeId: NodeId) {
  const vtree = useContext(VTreeContext)

  if (!vtree) {
    return null
  }

  return vtree.nodes[nodeId] ?? null
}

export function useNodeVisibility(nodeId: NodeId) {
  const { visibleNodes, onToggleNodeVisibility } = useContext(NodeStateContext)

  return {
    isVisible: visibleNodes.has(nodeId),
    onToggleNodeVisibility: () => onToggleNodeVisibility(nodeId),
  }
}

export function useNodeBreakpoint(nodeId: NodeId) {
  const { breakpointNodes, onToggleBreakpoint } = useContext(NodeStateContext)
  return {
    hasBreakpoint: breakpointNodes.has(nodeId),
    onToggleBreakpoint: () => onToggleBreakpoint(nodeId),
  }
}

export function useNodeState(nodeId: NodeId, tag: Tag) {
  const {
    focusedNode,
    focusedNodeTag,
    selectedNode,
    selectedNodeTag,
    onFocusNode,
    onSelectNode,
    visibleNodes,
    onToggleNodeVisibility,
    breakpointNodes,
    onToggleBreakpoint,
  } = useContext(NodeStateContext)

  return {
    isFocused: focusedNode === nodeId && focusedNodeTag === tag,
    onFocusNode: useCallback(
      (tag: Tag = 'open') => onFocusNode(nodeId, tag),
      [onFocusNode, nodeId]
    ),
    isSelected: selectedNode === nodeId && selectedNodeTag === tag,
    onSelectNode: useCallback(
      (tag: Tag = 'open') => onSelectNode(nodeId, tag),
      [onSelectNode, nodeId]
    ),
    isVisible: visibleNodes.has(nodeId),
    onToggleNodeVisibility: useCallback(
      () => onToggleNodeVisibility(nodeId),
      [onToggleNodeVisibility, nodeId]
    ),
    hasBreakpoint: breakpointNodes.has(nodeId),
    onToggleBreakpoint: useCallback(
      () => onToggleBreakpoint(nodeId),
      [onToggleBreakpoint, nodeId]
    ),
  }
}
