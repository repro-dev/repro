import { Block } from '@jsxstyle/react'
import { NodeId, SyntheticId, VTree } from '@repro/domain'
import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Subscription, fromEvent } from 'rxjs'
import { TreeRenderer } from './TreeRenderer'
import { NodeState, NodeStateContext, Tag } from './context'

interface Props {
  vtree: VTree
  focusedNode: SyntheticId | null
  selectedNode: SyntheticId | null
  breakpointNodes: Set<NodeId>
  activeBreakpointNode: NodeId | null
  onFocusNode(nodeId: SyntheticId | null): void
  onSelectNode(nodeId: SyntheticId | null): void
  onToggleBreakpoint(nodeId: NodeId): void
  usingPicker: boolean
}

export const ElementTree: React.FC<Props> = ({
  vtree,
  focusedNode,
  selectedNode,
  breakpointNodes,
  activeBreakpointNode,
  onFocusNode,
  onSelectNode,
  onToggleBreakpoint,
}) => {
  const containerRef = useRef() as MutableRefObject<HTMLDivElement>
  const activeRef = useRef(false)
  const [visibleNodes, setVisibleNodes] = useState(new Set<NodeId>())
  const [openNodes, setOpenNodes] = useState(new Set<NodeId>())
  const [focusedNodeTag, setFocusedNodeTag] = useState<Tag>('open')
  const [selectedNodeTag, setSelectedNodeTag] = useState<Tag>('open')

  const openNode = useCallback(
    (nodeId: NodeId | null) => {
      setOpenNodes(openNodes => {
        const nextOpenNodes = new Set(openNodes)

        let currentNodeId = nodeId

        while (currentNodeId) {
          const node = vtree.nodes[currentNodeId]

          if (!node) {
            break
          }

          currentNodeId = node.map(node => node.parentId).orElse(null)

          if (currentNodeId) {
            nextOpenNodes.add(currentNodeId)
          }
        }

        return nextOpenNodes
      })
    },
    [setOpenNodes, vtree]
  )

  useEffect(() => {
    const subscription = new Subscription()

    subscription.add(
      fromEvent<PointerEvent>(containerRef.current, 'pointerenter').subscribe(
        () => (activeRef.current = true)
      )
    )

    subscription.add(
      fromEvent<PointerEvent>(containerRef.current, 'pointerleave').subscribe(
        () => (activeRef.current = false)
      )
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [containerRef, activeRef])

  useEffect(() => {
    if (!activeRef.current) {
      openNode(selectedNode)
    }
  }, [activeRef, selectedNode, openNode])

  useEffect(() => {
    if (!activeRef.current) {
      openNode(activeBreakpointNode)
      setSelectedNodeTag('open')
      onSelectNode(activeBreakpointNode)
    }
  }, [
    activeRef,
    activeBreakpointNode,
    openNode,
    setSelectedNodeTag,
    onSelectNode,
  ])

  useEffect(() => {
    const nextVisibleNodes = new Set(openNodes)

    if (!activeRef.current) {
      let nodeId = focusedNode

      while (nodeId) {
        const node = vtree.nodes[nodeId]

        if (!node) {
          break
        }

        nodeId = node.map(node => node.parentId).orElse(null)

        if (nodeId) {
          nextVisibleNodes.add(nodeId)
        }
      }
    }

    setVisibleNodes(nextVisibleNodes)
  }, [activeRef, vtree, focusedNode, openNodes, setVisibleNodes])

  useEffect(() => {
    let handle: number | null = null

    if (!activeRef.current) {
      handle = requestIdleCallback(() => {
        const treeRow = containerRef.current.querySelector(
          `[data-tree-node="${selectedNode}~open"]`
        )

        if (treeRow) {
          treeRow.scrollIntoView({
            block: 'center',
          })
        }
      })
    }

    return () => {
      if (handle != null) {
        cancelIdleCallback(handle)
      }
    }
  }, [containerRef, selectedNode])

  const toggleNode = useCallback(
    (nodeId: NodeId) =>
      setOpenNodes(openNodes => {
        const nextOpenNodes = new Set(openNodes)

        if (nextOpenNodes.has(nodeId)) {
          nextOpenNodes.delete(nodeId)
        } else {
          nextOpenNodes.add(nodeId)
        }

        return nextOpenNodes
      }),
    [setOpenNodes]
  )

  const nodeStateContext: NodeState = {
    focusedNode,
    focusedNodeTag,
    onFocusNode: (nodeId, tag) => {
      setFocusedNodeTag(tag)
      onFocusNode(nodeId)
    },
    selectedNode,
    selectedNodeTag,
    onSelectNode: (nodeId, tag) => {
      setSelectedNodeTag(tag)
      onSelectNode(nodeId)
    },
    visibleNodes,
    onToggleNodeVisibility: toggleNode,
    breakpointNodes,
    onToggleBreakpoint: onToggleBreakpoint,
  }

  return (
    <NodeStateContext.Provider value={nodeStateContext}>
      <Block
        paddingV={8}
        userSelect="none"
        props={{ onPointerLeave: () => onFocusNode(null), ref: containerRef }}
      >
        <TreeRenderer vtree={vtree} />
      </Block>
    </NodeStateContext.Provider>
  )
}
