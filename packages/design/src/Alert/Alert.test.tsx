import { cleanup, fireEvent, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import React, { act } from 'react'
import { Alert } from './Alert'

afterEach(cleanup)

const ALERT_DISMISS_DURATION_MS = 200

describe('Alert', () => {
  describe('without onDismiss', () => {
    it('does not render a close button', () => {
      render(<Alert type="info">Something happened</Alert>)
      const button = document.querySelector('button')
      expect(button).toBeNull()
    })

    it('renders with role="status" for info type', () => {
      render(<Alert type="info">Something happened</Alert>)
      const el = document.querySelector('[role="status"]')
      expect(el).not.toBeNull()
    })

    it('renders with role="alert" for danger type', () => {
      render(<Alert type="danger">Something happened</Alert>)
      const el = document.querySelector('[role="alert"]')
      expect(el).not.toBeNull()
    })
  })

  describe('with onDismiss', () => {
    beforeEach(() => {
      mock.timers.enable({ apis: ['setTimeout'] })
    })

    afterEach(() => {
      mock.timers.reset()
    })

    it('renders a close button with aria-label="Dismiss"', () => {
      render(
        <Alert type="info" onDismiss={() => {}}>
          Something happened
        </Alert>
      )
      const button = document.querySelector('button[aria-label="Dismiss"]')
      expect(button).not.toBeNull()
    })

    it('calls onDismiss after clicking the close button', async () => {
      let dismissed = false

      render(
        <Alert type="info" onDismiss={() => (dismissed = true)}>
          Something happened
        </Alert>
      )

      const button = document.querySelector('button[aria-label="Dismiss"]')
      expect(button).not.toBeNull()

      act(() => {
        fireEvent.click(button!)
        mock.timers.tick(ALERT_DISMISS_DURATION_MS)
      })

      expect(dismissed).toBe(true)
    })

    it('preserves role="status" semantics for info type when onDismiss is provided', () => {
      render(
        <Alert type="info" onDismiss={() => {}}>
          Something happened
        </Alert>
      )
      const el = document.querySelector('[role="status"]')
      expect(el).not.toBeNull()
    })

    it('preserves role="alert" semantics for danger type when onDismiss is provided', () => {
      render(
        <Alert type="danger" onDismiss={() => {}}>
          Something happened
        </Alert>
      )
      const el = document.querySelector('[role="alert"]')
      expect(el).not.toBeNull()
    })

    it('preserves role="alert" semantics for warning type when onDismiss is provided', () => {
      render(
        <Alert type="warning" onDismiss={() => {}}>
          Something happened
        </Alert>
      )
      const el = document.querySelector('[role="alert"]')
      expect(el).not.toBeNull()
    })

    it('preserves role="status" semantics for success type when onDismiss is provided', () => {
      render(
        <Alert type="success" onDismiss={() => {}}>
          Something happened
        </Alert>
      )
      const el = document.querySelector('[role="status"]')
      expect(el).not.toBeNull()
    })

    it('renders close button for all alert types', () => {
      const types = ['info', 'success', 'warning', 'danger'] as const
      for (const type of types) {
        const { unmount } = render(
          <Alert type={type} onDismiss={() => {}}>
            Something happened
          </Alert>
        )
        const button = document.querySelector('button[aria-label="Dismiss"]')
        expect(button).not.toBeNull()
        unmount()
      }
    })

    it('restores focus to previously-focused element after dismiss', async () => {
      // Create a trigger button that holds focus before the Alert mounts.
      // previousFocusRef is captured at mount time, so we must focus the
      // trigger *before* rendering the Alert.
      const trigger = document.createElement('button')
      trigger.id = 'focus-trigger'
      document.body.appendChild(trigger)
      trigger.focus()
      expect(document.activeElement).toBe(trigger)

      let dismissed = false
      const { unmount } = render(
        <Alert type="info" onDismiss={() => (dismissed = true)}>
          Something happened
        </Alert>
      )

      const button = document.querySelector('button[aria-label="Dismiss"]')
      expect(button).not.toBeNull()

      act(() => {
        fireEvent.click(button!)
        mock.timers.tick(ALERT_DISMISS_DURATION_MS)
      })

      expect(dismissed).toBe(true)
      // focus should return to the element that was focused when the Alert mounted
      expect(document.activeElement).toBe(trigger)

      unmount()
      document.body.removeChild(trigger)
    })

    it('calls onDismiss only once for repeated interactions before dismissal completes', () => {
      let dismissCount = 0

      render(
        <Alert type="info" onDismiss={() => dismissCount++}>
          Something happened
        </Alert>
      )

      const button = document.querySelector('button[aria-label="Dismiss"]')
      expect(button).not.toBeNull()

      act(() => {
        fireEvent.click(button!)
        fireEvent.click(button!)
        mock.timers.tick(ALERT_DISMISS_DURATION_MS)
      })

      expect(dismissCount).toBe(1)
    })

    it('clears the pending dismiss timeout on unmount', () => {
      const trigger = document.createElement('button')
      document.body.appendChild(trigger)
      trigger.focus()

      const nextFocusTarget = document.createElement('button')
      document.body.appendChild(nextFocusTarget)

      let dismissCount = 0
      const { unmount } = render(
        <Alert type="info" onDismiss={() => dismissCount++}>
          Something happened
        </Alert>
      )

      const button = document.querySelector('button[aria-label="Dismiss"]')
      expect(button).not.toBeNull()

      act(() => {
        fireEvent.click(button!)
        nextFocusTarget.focus()
        unmount()
        mock.timers.tick(ALERT_DISMISS_DURATION_MS)
      })

      expect(dismissCount).toBe(0)
      expect(document.activeElement).toBe(nextFocusTarget)

      trigger.remove()
      nextFocusTarget.remove()
    })

    it('dismisses when close button is activated with Enter key', () => {
      let dismissed = false

      render(
        <Alert type="info" onDismiss={() => (dismissed = true)}>
          Something happened
        </Alert>
      )

      const button = document.querySelector('button[aria-label="Dismiss"]')
      expect(button).not.toBeNull()
      button!.focus()

      act(() => {
        fireEvent.keyDown(button!, { key: 'Enter' })
        mock.timers.tick(ALERT_DISMISS_DURATION_MS)
      })

      expect(dismissed).toBe(true)
    })

    it('dismisses when close button is activated with Space key', () => {
      let dismissed = false

      render(
        <Alert type="info" onDismiss={() => (dismissed = true)}>
          Something happened
        </Alert>
      )

      const button = document.querySelector('button[aria-label="Dismiss"]')
      expect(button).not.toBeNull()
      button!.focus()

      act(() => {
        fireEvent.keyDown(button!, { key: ' ' })
        fireEvent.keyUp(button!, { key: ' ' })
        mock.timers.tick(ALERT_DISMISS_DURATION_MS)
      })

      expect(dismissed).toBe(true)
    })
  })
})
