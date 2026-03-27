import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { act, useState } from 'react'
import { Tabs } from './index'

afterEach(cleanup)

function pressKey(key: string, target?: Element) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  ;(target ?? document.activeElement ?? document).dispatchEvent(event)
  return event
}

function renderTabs(
  props: {
    value?: string
    defaultValue?: string
    onValueChange?: (v: string) => void
    orientation?: 'horizontal' | 'vertical'
  } = {}
) {
  return render(
    <Tabs defaultValue="a" {...props}>
      <Tabs.List aria-label="Test tabs">
        <Tabs.Tab value="a">Tab A</Tabs.Tab>
        <Tabs.Tab value="b">Tab B</Tabs.Tab>
        <Tabs.Tab value="c">Tab C</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="a">Panel A</Tabs.Panel>
      <Tabs.Panel value="b">Panel B</Tabs.Panel>
      <Tabs.Panel value="c">Panel C</Tabs.Panel>
    </Tabs>
  )
}

describe('Tabs — ARIA roles', () => {
  it('renders role="tablist"', () => {
    renderTabs()
    const tablist = document.querySelector('[role="tablist"]')
    expect(tablist).not.toBeNull()
  })

  it('renders role="tab" for each tab', () => {
    renderTabs()
    const tabs = document.querySelectorAll('[role="tab"]')
    expect(tabs.length).toBe(3)
  })

  it('renders role="tabpanel" for each panel', () => {
    renderTabs()
    const panels = document.querySelectorAll('[role="tabpanel"]')
    expect(panels.length).toBe(3)
  })

  it('sets aria-orientation on tablist (horizontal default)', () => {
    renderTabs()
    const tablist = document.querySelector('[role="tablist"]')
    expect(tablist?.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('sets aria-orientation=vertical when specified', () => {
    renderTabs({ orientation: 'vertical' })
    const tablist = document.querySelector('[role="tablist"]')
    expect(tablist?.getAttribute('aria-orientation')).toBe('vertical')
  })
})

describe('Tabs — ARIA attributes', () => {
  it('sets aria-selected="true" on active tab', () => {
    renderTabs({ defaultValue: 'b' })
    const tabs = document.querySelectorAll('[role="tab"]')
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false')
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('false')
  })

  it('sets aria-controls on tabs pointing to panel IDs', () => {
    renderTabs()
    const tabs = document.querySelectorAll('[role="tab"]')
    const panels = document.querySelectorAll('[role="tabpanel"]')
    const tabA = tabs[0]
    const panelA = panels[0]
    expect(tabA?.getAttribute('aria-controls')).toBe(panelA?.getAttribute('id'))
  })

  it('sets aria-labelledby on panels pointing to tab IDs', () => {
    renderTabs()
    const tabs = document.querySelectorAll('[role="tab"]')
    const panels = document.querySelectorAll('[role="tabpanel"]')
    const tabA = tabs[0]
    const panelA = panels[0]
    expect(panelA?.getAttribute('aria-labelledby')).toBe(
      tabA?.getAttribute('id')
    )
  })

  it('panels have tabIndex=0', () => {
    renderTabs()
    const panels = document.querySelectorAll('[role="tabpanel"]')
    panels.forEach(panel => {
      expect((panel as HTMLElement).tabIndex).toBe(0)
    })
  })

  it('active tab has tabIndex=0, inactive tabs have tabIndex=-1', () => {
    renderTabs({ defaultValue: 'b' })
    const tabs = document.querySelectorAll('[role="tab"]')
    expect((tabs[0] as HTMLElement).tabIndex).toBe(-1)
    expect((tabs[1] as HTMLElement).tabIndex).toBe(0)
    expect((tabs[2] as HTMLElement).tabIndex).toBe(-1)
  })
})

describe('Tabs — Panel visibility', () => {
  it('shows only the active panel, hides inactive ones', () => {
    renderTabs({ defaultValue: 'a' })
    const panels = document.querySelectorAll('[role="tabpanel"]')
    // Active panel is visible (no display:none)
    expect((panels[0] as HTMLElement).style.display).not.toBe('none')
    // Inactive panels hidden
    expect((panels[1] as HTMLElement).style.display).toBe('none')
    expect((panels[2] as HTMLElement).style.display).toBe('none')
  })
})

describe('Tabs — Uncontrolled mode', () => {
  it('clicking a tab makes it active', async () => {
    renderTabs({ defaultValue: 'a' })
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    await act(() => {
      tabs[1]!.click()
    })
    const panels = document.querySelectorAll('[role="tabpanel"]')
    expect((panels[0] as HTMLElement).style.display).toBe('none')
    expect((panels[1] as HTMLElement).style.display).not.toBe('none')
  })

  it('calls onValueChange when tab clicked', () => {
    let called = ''
    renderTabs({
      defaultValue: 'a',
      onValueChange: v => {
        called = v
      },
    })
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[2]!.click()
    expect(called).toBe('c')
  })
})

describe('Tabs — Controlled mode', () => {
  it('respects controlled value prop', () => {
    renderTabs({ value: 'c' })
    const tabs = document.querySelectorAll('[role="tab"]')
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false')
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false')
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true')
  })

  it('calls onValueChange with new value on click in controlled mode', () => {
    let changed = ''
    renderTabs({
      value: 'a',
      onValueChange: v => {
        changed = v
      },
    })
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[1]!.click()
    expect(changed).toBe('b')
  })
})

describe('Tabs — Keyboard navigation (horizontal)', () => {
  it('ArrowRight moves focus to next tab and activates it', () => {
    let active = 'a'

    function Wrapper() {
      const [v, setV] = useState('a')
      active = v
      return (
        <Tabs
          value={v}
          onValueChange={val => {
            active = val
            setV(val)
          }}
        >
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b">B</Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[0]!.focus()
    pressKey('ArrowRight')
    expect(active).toBe('b')
  })

  it('ArrowLeft moves focus to previous tab', () => {
    let active = 'b'

    function Wrapper() {
      const [v, setV] = useState('b')
      return (
        <Tabs
          value={v}
          onValueChange={val => {
            active = val
            setV(val)
          }}
        >
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b">B</Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[1]!.focus()
    pressKey('ArrowLeft')
    expect(active).toBe('a')
  })

  it('wraps from last to first on ArrowRight', () => {
    let active = 'c'

    function Wrapper() {
      const [v, setV] = useState('c')
      return (
        <Tabs
          value={v}
          onValueChange={val => {
            active = val
            setV(val)
          }}
        >
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b">B</Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[2]!.focus()
    pressKey('ArrowRight')
    expect(active).toBe('a')
  })

  it('wraps from first to last on ArrowLeft', () => {
    let active = 'a'

    function Wrapper() {
      const [v, setV] = useState('a')
      return (
        <Tabs
          value={v}
          onValueChange={val => {
            active = val
            setV(val)
          }}
        >
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b">B</Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[0]!.focus()
    pressKey('ArrowLeft')
    expect(active).toBe('c')
  })

  it('Home moves to first tab', () => {
    let active = 'c'

    function Wrapper() {
      const [v, setV] = useState('c')
      return (
        <Tabs
          value={v}
          onValueChange={val => {
            active = val
            setV(val)
          }}
        >
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b">B</Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[2]!.focus()
    pressKey('Home')
    expect(active).toBe('a')
  })

  it('End moves to last tab', () => {
    let active = 'a'

    function Wrapper() {
      const [v, setV] = useState('a')
      return (
        <Tabs
          value={v}
          onValueChange={val => {
            active = val
            setV(val)
          }}
        >
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b">B</Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[0]!.focus()
    pressKey('End')
    expect(active).toBe('c')
  })
})

describe('Tabs — Keyboard navigation (vertical)', () => {
  it('ArrowDown moves to next tab in vertical orientation', () => {
    let active = 'a'

    function Wrapper() {
      const [v, setV] = useState('a')
      return (
        <Tabs
          value={v}
          orientation="vertical"
          onValueChange={val => {
            active = val
            setV(val)
          }}
        >
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b">B</Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[0]!.focus()
    pressKey('ArrowDown')
    expect(active).toBe('b')
  })

  it('ArrowUp moves to previous tab in vertical orientation', () => {
    let active = 'b'

    function Wrapper() {
      const [v, setV] = useState('b')
      return (
        <Tabs
          value={v}
          orientation="vertical"
          onValueChange={val => {
            active = val
            setV(val)
          }}
        >
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b">B</Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[1]!.focus()
    pressKey('ArrowUp')
    expect(active).toBe('a')
  })
})

describe('Tabs — Disabled tabs', () => {
  it('disabled tab cannot be clicked', () => {
    let active = 'a'

    render(
      <Tabs
        defaultValue="a"
        onValueChange={v => {
          active = v
        }}
      >
        <Tabs.List aria-label="Test">
          <Tabs.Tab value="a">A</Tabs.Tab>
          <Tabs.Tab value="b" disabled>
            B
          </Tabs.Tab>
          <Tabs.Tab value="c">C</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="a">A</Tabs.Panel>
        <Tabs.Panel value="b">B</Tabs.Panel>
        <Tabs.Panel value="c">C</Tabs.Panel>
      </Tabs>
    )

    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[1]!.click()
    // Should remain on 'a' since 'b' is disabled
    expect(active).toBe('a')
  })

  it('keyboard navigation skips disabled tabs', () => {
    let active = 'a'

    function Wrapper() {
      const [v, setV] = useState('a')
      return (
        <Tabs
          value={v}
          onValueChange={val => {
            active = val
            setV(val)
          }}
        >
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b" disabled>
              B (disabled)
            </Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[0]!.focus()
    pressKey('ArrowRight')
    // Should skip 'b' and land on 'c'
    expect(active).toBe('c')
  })
})

describe('Tabs — DOM focus moves with keyboard nav', () => {
  it('focus moves to newly activated tab on keyboard navigation', async () => {
    function Wrapper() {
      const [v, setV] = useState('a')
      return (
        <Tabs value={v} onValueChange={setV}>
          <Tabs.List aria-label="Test">
            <Tabs.Tab value="a">A</Tabs.Tab>
            <Tabs.Tab value="b">B</Tabs.Tab>
            <Tabs.Tab value="c">C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">A</Tabs.Panel>
          <Tabs.Panel value="b">B</Tabs.Panel>
          <Tabs.Panel value="c">C</Tabs.Panel>
        </Tabs>
      )
    }

    render(<Wrapper />)
    const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[0]!.focus()
    expect(document.activeElement).toBe(tabs[0])

    await act(() => {
      pressKey('ArrowRight')
    })

    const updatedTabs = document.querySelectorAll<HTMLElement>('[role="tab"]')
    expect(document.activeElement).toBe(updatedTabs[1])
  })
})
