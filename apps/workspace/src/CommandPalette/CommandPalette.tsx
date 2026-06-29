import { Block, Col, Row } from '@jsxstyle/react'
import { color, Input, Modal, spacing, textStyles } from '@repro/design'
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
  const navigate = useNavigate()
  const { selectedProject } = useProjectContext()
  const hasProject = selectedProject != null

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when the palette is opened or closed
  useEffect(() => {
    if (open) {
      // Reset on open so it's fresh each time
      setQuery('')
      setSelectedIndex(0)
      // Auto-focus the input after a tick so the Modal is mounted
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

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

  return (
    <Modal
      width={480}
      height="auto"
      open={open}
      onClose={onClose}
      aria-label="Command palette"
    >
      <Modal.Body>
        <Col gap={spacing.xs}>
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
              paddingTop={spacing.xs}
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
                    borderRadius={4}
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
      </Modal.Body>
    </Modal>
  )
}
