import {
  autoUpdate,
  flip,
  size as floatingSize,
  offset,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
} from '@floating-ui/react'
import { Block, Row } from '@jsxstyle/react'
import { ChevronDown } from 'lucide-react'
import React, {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import mergeRefs from 'react-merge-refs'
import { Portal } from '../Portal'
import { color } from '../tokens/colors'
import { radius, shadow } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { duration, easing, transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { lineHeight, MINIMUM_FONT_SIZE } from '../tokens/typography'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  id?: string
  value?: string
  defaultValue?: string
  onChange?(value: string): void
  options: SelectOption[]
  placeholder?: string
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  required?: boolean
  name?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

const sizes = {
  small: 6,
  medium: 8,
  large: 10,
}

const LISTBOX_PADDING = spacing.sm

/**
 * Select dropdown for choosing one option from a list. Renders a custom
 * trigger button with a floating listbox popover. Implements the WAI-ARIA
 * Listbox pattern with full keyboard navigation (Arrow keys, Home/End,
 * Enter/Space to select, Escape to close, type-ahead search).
 *
 * Uses `@floating-ui/react` for viewport-aware positioning with automatic
 * flip and resize behavior.
 *
 * This is a proof-of-concept for the Custom Minimal + floating-ui approach
 * evaluated in REP-285.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      id,
      value: valueProp,
      defaultValue,
      onChange,
      options,
      placeholder = 'Select an option',
      size = 'medium',
      disabled = false,
      required = false,
      name,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
    },
    ref
  ) => {
    const isControlled = valueProp !== undefined
    const [internalValue, setInternalValue] = useState(defaultValue ?? '')
    const wasControlledRef = useRef(isControlled)

    if (process.env['NODE_ENV'] !== 'production') {
      if (wasControlledRef.current !== isControlled) {
        console.warn(
          `Select: A component is changing from ${
            wasControlledRef.current ? 'controlled' : 'uncontrolled'
          } to ${
            isControlled ? 'controlled' : 'uncontrolled'
          }. This is not supported and may cause unexpected behavior.`
        )
      }
    }
    wasControlledRef.current = isControlled

    const resolvedValue = isControlled ? valueProp : internalValue

    const [isOpen, setIsOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState<number | null>(null)
    const listRef = useRef<Array<HTMLElement | null>>([])
    const listContentRef = useRef<Array<string | null>>(
      options.map(o => (o.disabled ? null : o.label))
    )

    const listboxId = useId()

    if (process.env['NODE_ENV'] !== 'production') {
      if (!ariaLabel && !ariaLabelledBy && !id) {
        console.warn(
          'Select: No accessible label provided. Pass `aria-label`, `aria-labelledby`, or `id` (with a corresponding <Label htmlFor>) to ensure screen reader accessibility.'
        )
      }
    }

    const base = sizes[size]
    const triggerFontSize = Math.max(base * 1.5, MINIMUM_FONT_SIZE)
    const triggerPaddingV = base
    const triggerPaddingH = base * 1.5
    const iconSize = Math.max(base * 2, 16)

    const selectedOption = useMemo(
      () => options.find(o => o.value === resolvedValue),
      [options, resolvedValue]
    )

    const selectedIndex = useMemo(
      () => options.findIndex(o => o.value === resolvedValue),
      [options, resolvedValue]
    )

    const { refs, floatingStyles, context } = useFloating({
      open: isOpen,
      onOpenChange: setIsOpen,
      placement: 'bottom-start',
      whileElementsMounted: autoUpdate,
      middleware: [
        offset(spacing.sm),
        flip({ padding: spacing.md }),
        floatingSize({
          apply({ rects, availableHeight, elements }) {
            Object.assign(elements.floating.style, {
              minWidth: `${rects.reference.width}px`,
              maxHeight: `${availableHeight}px`,
            })
          },
          padding: spacing.md,
        }),
      ],
    })

    const click = useClick(context)
    const dismiss = useDismiss(context)
    const role = useRole(context, { role: 'listbox' })
    const listNavigation = useListNavigation(context, {
      listRef,
      activeIndex,
      selectedIndex,
      onNavigate: setActiveIndex,
      loop: true,
    })
    const typeahead = useTypeahead(context, {
      listRef: listContentRef,
      activeIndex,
      selectedIndex,
      onMatch: index => {
        if (isOpen) {
          setActiveIndex(index)
        } else {
          handleSelect(index)
        }
      },
    })

    const { getReferenceProps, getFloatingProps, getItemProps } =
      useInteractions([click, dismiss, role, listNavigation, typeahead])

    const handleSelect = useCallback(
      (index: number) => {
        const option = options[index]
        if (option && !option.disabled) {
          if (!isControlled) {
            setInternalValue(option.value)
          }
          onChange?.(option.value)
          setIsOpen(false)
        }
      },
      [options, onChange, isControlled]
    )

    return (
      <Block>
        <Row
          component="button"
          alignItems="center"
          justifyContent="space-between"
          gap={spacing.md}
          width="100%"
          padding={`${triggerPaddingV}px ${triggerPaddingH}px`}
          backgroundColor={color.bg.surface}
          border={`1px solid ${color.border.strong}`}
          borderRadius={radius.sm}
          boxShadow={`0 0.5px 1.5px ${color.border.strong}DA`}
          fontSize={triggerFontSize}
          lineHeight={lineHeight.relaxed}
          color={selectedOption ? color.text.default : color.text.muted}
          cursor={disabled ? 'not-allowed' : 'pointer'}
          opacity={disabled ? 0.5 : 1}
          transition={transition.fast}
          hoverBorderColor={disabled ? undefined : color.border.emphasis}
          textAlign="left"
          {...focusRing()}
          props={{
            ref: mergeRefs([ref, refs.setReference].filter(Boolean)),
            id,
            type: 'button',
            disabled,
            'aria-label': ariaLabel,
            'aria-labelledby': ariaLabelledBy,
            'aria-expanded': isOpen,
            'aria-haspopup': 'listbox' as const,
            ...getReferenceProps(),
          }}
        >
          <Block
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            flex={1}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </Block>

          <Block
            flexShrink={0}
            display="flex"
            alignItems="center"
            transition={transition.fast}
            transform={isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
          >
            <ChevronDown size={iconSize} color={color.text.muted} />
          </Block>
        </Row>

        <Block
          component="input"
          position="absolute"
          width={1}
          height={1}
          overflow="hidden"
          opacity={0}
          props={{
            name,
            value: resolvedValue,
            required,
            onChange() {},
            tabIndex: -1,
            'aria-hidden': true,
          }}
        />

        {isOpen && (
          <Portal>
            <Block
              backgroundColor={color.bg.surface}
              borderRadius={radius.md}
              boxShadow={shadow.lg}
              border={`1px solid ${color.border.default}`}
              padding={LISTBOX_PADDING}
              overflowY="auto"
              zIndex={2 ** 32 - 1}
              animation={`selectFadeIn ${duration[100]} ${easing.easeOut}`}
              props={{
                ref: refs.setFloating,
                style: floatingStyles,
                ...getFloatingProps(),
              }}
            >
              <Block
                component="ul"
                margin={0}
                padding={0}
                listStyleType="none"
                props={{
                  id: listboxId,
                  role: 'listbox',
                  'aria-labelledby': ariaLabelledBy ?? id,
                }}
              >
                {options.map((option, index) => {
                  const isSelected = option.value === resolvedValue
                  const isActive = activeIndex === index
                  const isDisabled = option.disabled === true

                  return (
                    <Row
                      key={option.value}
                      component="li"
                      alignItems="center"
                      padding={`${base}px ${base * 1.5}px`}
                      fontSize={triggerFontSize}
                      lineHeight={lineHeight.relaxed}
                      borderRadius={radius.sm}
                      cursor={isDisabled ? 'not-allowed' : 'pointer'}
                      color={
                        isDisabled
                          ? color.text.muted
                          : isSelected
                          ? color.primary
                          : color.text.default
                      }
                      backgroundColor={
                        isActive && !isDisabled ? color.bg.hover : 'transparent'
                      }
                      opacity={isDisabled ? 0.5 : 1}
                      transition={transition.fast}
                      props={{
                        ref: (node: HTMLElement | null) => {
                          listRef.current[index] = node
                        },
                        role: 'option',
                        'aria-selected': isSelected,
                        'aria-disabled': isDisabled || undefined,
                        tabIndex: isActive ? 0 : -1,
                        ...getItemProps({
                          onClick: () => {
                            if (!isDisabled) {
                              handleSelect(index)
                            }
                          },
                        }),
                      }}
                    >
                      {option.label}
                    </Row>
                  )
                })}
              </Block>
            </Block>
          </Portal>
        )}
      </Block>
    )
  }
)

Select.displayName = 'Select'
