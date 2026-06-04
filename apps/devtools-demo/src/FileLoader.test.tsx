import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { FileLoader } from './FileLoader'

describe('FileLoader', () => {
  let loadedFile: File | null = null

  function handleLoad(file: File) {
    loadedFile = file
  }

  afterEach(() => {
    cleanup()
    loadedFile = null
  })

  it('renders drop instructions', () => {
    render(<FileLoader onLoad={handleLoad} />)
    assert.ok(screen.getByText('Drop your .repro file here'))
  })

  it('renders Browse files button', () => {
    render(<FileLoader onLoad={handleLoad} />)
    assert.ok(screen.getByText('Browse files'))
  })

  it('calls onLoad when a .repro file is dropped', () => {
    render(<FileLoader onLoad={handleLoad} />)

    const file = new File(['test'], 'recording.repro')
    const dropZone = screen
      .getByText('Drop your .repro file here')
      .closest('div')!

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
        items: [],
        types: ['Files'],
      },
    })

    assert.equal(loadedFile, file)
  })

  it('does not call onLoad when a non-.repro file is dropped', () => {
    render(<FileLoader onLoad={handleLoad} />)

    const file = new File(['test'], 'notes.txt')
    const dropZone = screen
      .getByText('Drop your .repro file here')
      .closest('div')!

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
        items: [],
        types: ['Files'],
      },
    })

    assert.equal(loadedFile, null)
  })

  it('clicking Browse files triggers hidden file input', () => {
    render(<FileLoader onLoad={handleLoad} />)

    const input = document.querySelector('input[type="file"]')
    assert.ok(input)

    const clickSpy = mock.method(HTMLInputElement.prototype, 'click')

    try {
      const button = screen.getByText('Browse files')
      button.click()

      assert.equal(clickSpy.mock.callCount(), 1)
    } finally {
      clickSpy.mock.restore()
    }
  })
})
