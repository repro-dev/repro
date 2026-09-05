/**
 * REP-1662: Snapshot events with omitted optional fields must encode.
 *
 * The PlaybackEditor/RangeTimeline story fixtures omit frameworkState,
 * cssRules, and colorScheme from the Snapshot payload. The encoder's size
 * pass treats omitted (undefined) nullable fields as wire-null; this test
 * pins the write pass to the same contract.
 */
import {
  PointerState,
  SnapshotEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import expect from 'expect'
import { describe, it } from 'node:test'

import { html2VTree } from './html2VTree'

// Exact HTML string used by packages/playback/src/PlaybackEditor/PlaybackEditor.stories.tsx
const STORY_HTML = `
  <!doctype html>
  <html lang="en">
    <head>
      <style>
        .box { width: 100px; height: 100px; }
        .blue { background-color: blue; }
        .red { background-color: red; }
      </style>
    </head>
    <body>
      <div class="box blue"></div>
    </body>
  </html>
`

describe('libs/record: snapshot payload encoding (REP-1662)', () => {
  it('should encode a Snapshot event omitting nullable fields without overrunning the buffer', () => {
    const vtree = html2VTree(STORY_HTML)
    if (!vtree) throw new Error('html2VTree returned an empty tree')

    // The stories (and real capture payloads) omit the nullable fields
    // entirely, which JS represents as undefined. The generated Snapshot type
    // spells them `| null`, so the omission is expressed via Partial.
    const data: Partial<SnapshotEvent['data']> = {
      dom: vtree,
      interaction: {
        pageURL: '',
        pointer: [10, 10],
        pointerState: PointerState.Up,
        scroll: {},
        viewport: [400, 400],
      },
    }
    const payload = {
      type: SourceEventType.Snapshot,
      time: 0,
      data,
    } as SnapshotEvent

    // RED before fix: RangeError: Offset is outside the bounds of the DataView
    const event = SourceEventView.from(new Box(payload))

    // Omitted nullable fields decode symmetrically as wire-null.
    const decoded = SourceEventView.decode(event).unwrap()
    if (decoded.type !== SourceEventType.Snapshot) {
      throw new Error(`Expected Snapshot event, got type ${decoded.type}`)
    }

    expect(decoded.time).toBe(0)
    expect(decoded.data.frameworkState).toBe(null)
  })
})
