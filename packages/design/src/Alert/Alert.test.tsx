import { cleanup, fireEvent, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { act } from 'react'
import { Alert } from './Alert'

afterEach(cleanup)

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

      await act(async () => {
        fireEvent.click(button!)
        // advance past the 200ms dismiss delay
        await new Promise(resolve => setTimeout(resolve, 250))
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

      await act(async () => {
        fireEvent.click(button!)
        await new Promise(resolve => setTimeout(resolve, 250))
      })

      expect(dismissed).toBe(true)
      // focus should return to the element that was focused when the Alert mounted
      expect(document.activeElement).toBe(trigger)

      unmount()
      document.body.removeChild(trigger)
    })

    it('dismisses when close button is activated with Enter key', async () => {
      let dismissed = false

      render(
        <Alert type="info" onDismiss={() => (dismissed = true)}>
          Something happened
        </Alert>
      )

      const button = document.querySelector('button[aria-label="Dismiss"]')
      expect(button).not.toBeNull()

      await act(async () => {
        fireEvent.keyDown(button!, { key: 'Enter' })
        fireEvent.click(button!)
        await new Promise(resolve => setTimeout(resolve, 250))
      })

      expect(dismissed).toBe(true)
    })

    it('dismisses when close button is activated with Space key', async () => {
      let dismissed = false

      render(
        <Alert type="info" onDismiss={() => (dismissed = true)}>
          Something happened
        </Alert>
      )

      const button = document.querySelector('button[aria-label="Dismiss"]')
      expect(button).not.toBeNull()

      await act(async () => {
        fireEvent.keyDown(button!, { key: ' ' })
        fireEvent.click(button!)
        await new Promise(resolve => setTimeout(resolve, 250))
      })

      expect(dismissed).toBe(true)
    })
  })
})
