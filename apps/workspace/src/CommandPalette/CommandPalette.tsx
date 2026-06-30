import { Block, Col, Row } from '@jsxstyle/react'
import {
  color,
  Input,
  Portal,
  radius,
  shadow,
  spacing,
  textStyles,
  useReducedMotion,
} from '@repro/design'
import {
  CreditCardIcon,
  FolderIcon,
  KeyIcon,
  PlayIcon,
  SettingsIcon,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectContext } from '../ProjectContext'

// ---------------------------------------------------------------------------
// CSS keyframe for command palette entrance animation.
// ---------------------------------------------------------------------------

const KEYFRAMES = `
@keyframes command-palette-in {
  from { opacity: 0; transform: scale(0.98) translateY(-4px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}
`

let keyframesInjected = false

function injectKeyframes(): void {
  if (keyframesInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.id = 'repro-command-palette-keyframes'
  style.textContent = KEYFRAMES
  document.head.appendChild(style)
  keyframesInjected = true
}

interface CommandItem {
  label: string
  icon: React.ComponentType<{ size?: string | number }>
  route: string
  requiresProject: boolean
}

const COMMAND_ITEMS: CommandItem[] = [
  { label: 'Sessions', icon: PlayIcon, route: '/', requiresProject: true },
  {
    label: 'Projects',
    icon: FolderIcon,
    route: '/projects',
    requiresProject: false,
  },
  {
    label: 'Settings',
    icon: SettingsIcon,
    route: '/settings',
    requiresProject: false,
  },
  {
    label: 'API Keys',
    icon: KeyIcon,
    route: '/settings/api-keys',
    requiresProject: false,
  },
  {
    label: 'Billing',
    icon: CreditCardIcon,
    route: '/settings/billing',
    requiresProject: false,
  },
]

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
}) => {
  injectKeyframes()

  const navigate = useNavigate()
  const { selectedProject } = useProjectContext()
  const hasProject = selectedProject != null

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isReducedMotion = useReducedMotion()

  // Reset state when the palette is opened or closed
  useEffect(() => {
    if (open) {
      // Reset on open so it's fresh each time
      setQuery('')
      setSelectedIndex(0)
      // Auto-focus the input after a tick so the container is mounted
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Escape key handler
  useEffect(() => {
    if (!open || !onClose) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onClose])

  const filteredItems = useMemo(() => {
    const lowerQuery = query.toLowerCase()
    return COMMAND_ITEMS.filter(item => {
      // Hide project-required items when no project context
      if (item.requiresProject && !hasProject) {
        return false
      }
      return item.label.toLowerCase().includes(lowerQuery)
    })
  }, [query, hasProject])

  // Handle keyboard navigation via a native DOM listener on the input element
  useEffect(() => {
    const input = inputRef.current
    if (!input || !open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (filteredItems.length === 0) {
        return
      }

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault()
          setSelectedIndex(prev =>
            prev >= filteredItems.length - 1 ? 0 : prev + 1
          )
          break
        }
        case 'ArrowUp': {
          event.preventDefault()
          setSelectedIndex(prev =>
            prev <= 0 ? filteredItems.length - 1 : prev - 1
          )
          break
        }
        case 'Enter': {
          event.preventDefault()
          const item = filteredItems[selectedIndex]
          if (item) {
            navigate(item.route)
            onClose()
          }
          break
        }
      }
    }

    input.addEventListener('keydown', handleKeyDown)
    return () => input.removeEventListener('keydown', handleKeyDown)
  }, [open, filteredItems, selectedIndex, navigate, onClose])

  const handleItemClick = useCallback(
    (route: string) => {
      navigate(route)
      onClose()
    },
    [navigate, onClose]
  )

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value)
      setSelectedIndex(0)
    },
    []
  )

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && onClose) {
        onClose()
      }
    },
    [onClose]
  )

  if (!open) return null

  return (
    <Portal>
      <Col
        alignItems="center"
        background={color.bg.overlay}
        position="fixed"
        top={0}
        left={0}
        bottom={0}
        right={0}
        // eslint-disable-next-line @repro/oxlint-plugin-design/no-hardcoded-spacing
        paddingTop="20vh"
        props={
          {
            onClick: handleBackdropClick,
            'data-testid': 'command-palette-backdrop',
          } as React.HTMLAttributes<HTMLDivElement>
        }
      >
        <Col
          width={480}
          background={color.bg.surface}
          boxShadow={shadow.lg}
          borderRadius={radius.md}
          overflow="hidden"
          props={{
            ref: containerRef,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': 'Command palette',
            style: isReducedMotion
              ? undefined
              : {
                  animation: 'command-palette-in 200ms ease-out forwards',
                },
          }}
        >
          <Col padding={spacing.xl} gap={spacing.md}>
            <Input
              ref={inputRef}
              aria-label="Search commands"
              placeholder="Type a command…"
              value={query}
              onChange={handleInputChange}
              autoFocus
            />

            {filteredItems.length === 0 ? (
              <Block
                padding={spacing.lg}
                {...textStyles.body}
                color={color.text.secondary}
              >
                No commands found
              </Block>
            ) : (
              <Col
                gap={spacing.xs}
                props={{
                  role: 'listbox',
                  'aria-label': 'Commands',
                }}
              >
                {filteredItems.map((item, index) => {
                  const IconComponent = item.icon
                  const isHighlighted = index === selectedIndex

                  return (
                    <Row
                      key={item.label}
                      alignItems="center"
                      gap={spacing.md}
                      paddingH={spacing.md}
                      paddingV={spacing.sm}
                      cursor="pointer"
                      backgroundColor={
                        isHighlighted ? color.bg.hover : 'transparent'
                      }
                      borderRadius={radius.sm}
                      props={{
                        role: 'option',
                        'aria-selected': isHighlighted,
                        onClick: () => handleItemClick(item.route),
                        onMouseEnter: () => setSelectedIndex(index),
                      }}
                    >
                      <Block color={color.text.secondary} flexShrink={0}>
                        <IconComponent size={16} />
                      </Block>

                      <Block {...textStyles.body}>{item.label}</Block>
                    </Row>
                  )
                })}
              </Col>
            )}
          </Col>
        </Col>
      </Col>
    </Portal>
  )
}
