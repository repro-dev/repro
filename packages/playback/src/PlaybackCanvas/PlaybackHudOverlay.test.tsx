import { cleanup, fireEvent, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { useEffect } from 'react'
import {
  PlaybackHudAction,
  PlaybackHudMeta,
  PlaybackHudProvider,
  usePlaybackHud,
} from './PlaybackHudContext'
import { PlaybackHudOverlay } from './PlaybackHudOverlay'

interface TriggerProps {
  action: PlaybackHudAction
  meta?: PlaybackHudMeta
}

function Trigger({ action, meta }: TriggerProps) {
  const { showHud } = usePlaybackHud()

  useEffect(() => {
    showHud(action, meta)
  }, [showHud, action, meta])

  return null
}

function DoubleTrigger({ action }: { action: PlaybackHudAction }) {
  const { showHud } = usePlaybackHud()

  useEffect(() => {
    showHud(action)
    showHud(action)
  }, [showHud, action])

  return null
}

function StackingTrigger() {
  const { showHud } = usePlaybackHud()

  useEffect(() => {
    showHud('play')
    showHud('seek-backward')
    showHud('speed-up', { speed: 2 })
  }, [showHud])

  return null
}

describe('PlaybackHudOverlay', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders nothing when there are no active overlays', () => {
    const { container } = render(
      <PlaybackHudProvider>
        <PlaybackHudOverlay />
      </PlaybackHudProvider>
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders the correct icon/text for each action', () => {
    const cases: Array<{
      action: PlaybackHudAction
      meta?: PlaybackHudMeta
      text: string
    }> = [
      { action: 'play', text: '' },
      { action: 'pause', text: '' },
      { action: 'seek-backward', text: '-5s' },
      { action: 'seek-forward', text: '+5s' },
      { action: 'seek-to-start', text: '' },
      { action: 'seek-to-end', text: '' },
      { action: 'speed-up', meta: { speed: 1.5 }, text: '1.5x' },
      { action: 'speed-down', meta: { speed: 0.5 }, text: '0.5x' },
    ]

    for (const { action, meta, text } of cases) {
      const { container, unmount } = render(
        <PlaybackHudProvider>
          <PlaybackHudOverlay />
          <Trigger action={action} meta={meta} />
        </PlaybackHudProvider>
      )

      const overlay = container.firstElementChild
      expect(overlay).not.toBeNull()
      expect(overlay!.textContent).toContain(text)
      unmount()
    }
  })

  it('fades out and unmounts after transitionEnd', () => {
    const { container } = render(
      <PlaybackHudProvider>
        <PlaybackHudOverlay />
        <Trigger action="play" />
      </PlaybackHudProvider>
    )

    const overlay = container.firstElementChild
    expect(overlay).not.toBeNull()

    const badge = overlay!.firstElementChild
    expect(badge).not.toBeNull()

    fireEvent.transitionEnd(badge!)

    expect(container.firstChild).toBeNull()
  })

  it('replaces the same action instead of stacking duplicates', () => {
    const { container } = render(
      <PlaybackHudProvider>
        <PlaybackHudOverlay />
        <DoubleTrigger action="play" />
      </PlaybackHudProvider>
    )

    const overlay = container.firstElementChild
    expect(overlay).not.toBeNull()
    expect(overlay!.childElementCount).toBe(1)

    fireEvent.transitionEnd(overlay!.firstElementChild!)

    expect(container.firstChild).toBeNull()
  })

  it('stacks overlays for different actions and removes them independently', () => {
    const { container } = render(
      <PlaybackHudProvider>
        <PlaybackHudOverlay />
        <StackingTrigger />
      </PlaybackHudProvider>
    )

    const overlay = container.firstElementChild
    expect(overlay).not.toBeNull()
    expect(overlay!.childElementCount).toBe(3)

    const badges = Array.from(overlay!.children)
    for (const badge of badges) {
      fireEvent.transitionEnd(badge)
    }

    expect(container.firstChild).toBeNull()
  })

  it('renders nothing and does not throw outside a provider', () => {
    const { container } = render(<PlaybackHudOverlay />)
    expect(container.firstChild).toBeNull()
  })
})
