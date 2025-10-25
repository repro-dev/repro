import { Stats, StatsLevel } from '@repro/diagnostics'
import {
  InteractionType,
  PatchType,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { html2VTree } from '@repro/recording'
import { Box, List } from '@repro/tdl'
import { findElementById, findElementsByClassName } from '@repro/vdom-utils'
import expect from 'expect'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createSourcePlayback } from './createSourcePlayback'
import { BreakpointType } from './types'

describe('createSourcePlayback', () => {
  it('should seek to the next breaking event', () => {
    Stats.enable()
    Stats.setLevel(StatsLevel.Debug)

    const vtree = html2VTree(`
      <div id="container">
        <div class="item">One</div>
        <div class="item">Two</div>
        <div class="item">Three</div>
      </div>
    `)
    assert(vtree, 'vtree should not be null')

    const targetNode = findElementsByClassName(vtree, 'item')[0]
    assert(targetNode, 'targetNode should not be undefined')

    const targetNodeFirstChildId = targetNode.children[0]
    assert(
      targetNodeFirstChildId,
      "targetNode's first child ID should not be undefined"
    )

    const containerNode = findElementById(vtree, 'container')
    assert(containerNode, 'containerNode should not be undefined')

    const events = new List(SourceEventView, [])
    events.append(
      SourceEventView.from(
        new Box({
          type: SourceEventType.Snapshot,
          time: 0,
          data: {
            dom: vtree,
            interaction: null,
          },
        })
      ),

      SourceEventView.from(
        new Box({
          type: SourceEventType.DOMPatch,
          time: 100,
          data: new Box({
            type: PatchType.AddNodes,
            nextSiblingId: targetNode.id,
            previousSiblingId: null,
            parentId: containerNode.id,
            nodes: [html2VTree('<div class="item">Zero</div>')!],
          }),
        })
      ),

      SourceEventView.from(
        new Box({
          type: SourceEventType.DOMPatch,
          time: 500,
          data: new Box({
            type: PatchType.Text,
            targetId: targetNode.children[0]!,
            oldValue: 'One',
            value: 'Uno',
            parentId: targetNode.id,
          }),
        })
      ),

      SourceEventView.from(
        new Box({
          type: SourceEventType.DOMPatch,
          time: 750,
          data: new Box({
            type: PatchType.Attribute,
            targetId: targetNode.id,
            name: 'title',
            value: 'One',
            oldValue: null,
          }),
        })
      ),

      SourceEventView.from(
        new Box({
          type: SourceEventType.Interaction,
          time: 900,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [0, 0],
            to: [50, 50],
            duration: 25,
          }),
        })
      )
    )

    const playback = createSourcePlayback(events, 1000, {})

    expect(playback.getDuration()).toBe(1000)
    expect(playback.getLatestEventTime()).toBe(900)

    expect(playback.getElapsed()).toBe(-1)
    expect(playback.getActiveIndex()).toBe(-1)

    playback.addBreakpoint({
      type: BreakpointType.VNode,
      nodeId: targetNode.id,
    })

    expect(playback.getBreakpoints()).toHaveLength(1)

    playback.breakNext()

    expect(playback.getElapsed()).toBe(500)
    expect(playback.getActiveIndex()).toBe(2)
  })
})
