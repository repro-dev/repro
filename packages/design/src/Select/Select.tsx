/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
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
  useTransitionStyles,
  useTypeahead,
} from '@floating-ui/react'
import { Block, Row } from '@jsxstyle/react'
import { Check, ChevronDown } from 'lucide-react'
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import mergeRefs from 'react-merge-refs'
import { useFormFieldContext } from '../FormField/FormFieldContext'
import { Portal } from '../Portal'
import { color } from '../tokens/colors'
import { radius, shadow, zIndex } from '../tokens/elevation'
import { formControlHeight } from '../tokens/formControl'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { lineHeight, MINIMUM_FONT_SIZE } from '../tokens/typography'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  /** Optional icon rendered before the label text. Accepts any React node (e.g. a lucide icon element). */
  icon?: React.ReactNode
}

export interface SelectOptionGroup {
  label: string
  options: SelectOption[]
}

export type SelectOptionsInput = Array<SelectOption | SelectOptionGroup>

export interface SelectOptionState {
  isSelected: boolean
  isActive: boolean
}

export interface SelectProps {
  id?: string
  value?: string
  defaultValue?: string
  onChange?(value: string): void
  options: SelectOptionsInput
  placeholder?: string
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  required?: boolean
  name?: string
  error?: boolean
  renderOption?(option: SelectOption, state: SelectOptionState): React.ReactNode
  renderValue?(option: SelectOption): React.ReactNode
  'aria-label'?: string
  'aria-labelledby'?: string
  /** When true, renders a text input at the top of the dropdown for filtering options. */
  searchable?: boolean
}

const sizes = {
  small: 6,
  medium: 8,
  large: 10,
}

const LISTBOX_PADDING = spacing.sm

function isOptionGroup(
  item: SelectOption | SelectOptionGroup
): item is SelectOptionGroup {
  return 'options' in item && Array.isArray(item.options)
}

interface FlatItem {
  type: 'option' | 'group-header'
  option?: SelectOption
  groupLabel?: string
  groupId?: string
}

function flattenOptions(input: SelectOptionsInput): {
  flatItems: FlatItem[]
  flatOptions: SelectOption[]
} {
  const flatItems: FlatItem[] = []
  const flatOptions: SelectOption[] = []

  for (const item of input) {
    if (isOptionGroup(item)) {
      const groupId = `group-${flatItems.length}`
      flatItems.push({
        type: 'group-header',
        groupLabel: item.label,
        groupId,
      })
      for (const option of item.options) {
        flatItems.push({
          type: 'option',
          option,
          groupId,
        })
        flatOptions.push(option)
      }
    } else {
      flatItems.push({
        type: 'option',
        option: item,
      })
      flatOptions.push(item)
    }
  }

  return { flatItems, flatOptions }
}

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
      id: idProp,
      value: valueProp,
      defaultValue,
      onChange,
      options,
      placeholder = 'Select an option',
      size = 'medium',
      disabled: disabledProp,
      required = false,
      name,
      error: errorProp,
      renderOption,
      renderValue,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      searchable = false,
    },
    ref
  ) => {
    const fieldCtx = useFormFieldContext()

    const id = idProp ?? fieldCtx?.id
    const disabled = disabledProp ?? fieldCtx?.disabled ?? false
    const error = errorProp ?? fieldCtx?.invalid ?? false

    const isControlled = valueProp !== undefined
    const { flatItems, flatOptions } = useMemo(
      () => flattenOptions(options),
      [options]
    )
    const isEmpty = flatOptions.length === 0
    const isDisabled = disabled || isEmpty
    const [internalValue, setInternalValue] = useState(defaultValue ?? '')
    const wasControlledRef = useRef(isControlled)

    if (process.env.NODE_ENV !== 'production') {
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

    const [filterValue, setFilterValue] = useState('')
    const filterInputRef = useRef<HTMLInputElement>(null)

    // When searchable, filter flatItems by label. Group headers are included
    // only when they have at least one matching child option.
    const filteredFlatItems = useMemo(() => {
      if (!searchable || filterValue === '') return flatItems

      const query = filterValue.toLowerCase()

      // Determine which group IDs have at least one matching option
      const matchingGroupIds = new Set<string>()
      for (const item of flatItems) {
        if (
          item.type === 'option' &&
          item.groupId &&
          item.option?.label.toLowerCase().includes(query)
        ) {
          matchingGroupIds.add(item.groupId)
        }
      }

      return flatItems.filter(item => {
        if (item.type === 'group-header') {
          return item.groupId ? matchingGroupIds.has(item.groupId) : false
        }
        return item.option?.label.toLowerCase().includes(query) ?? false
      })
    }, [searchable, filterValue, flatItems])

    const filteredFlatOptions = useMemo(
      () =>
        filteredFlatItems.filter(i => i.type === 'option').map(i => i.option!),
      [filteredFlatItems]
    )

    const [isOpen, setIsOpen] = useState(false)

    // Reset filter when the dropdown closes
    const handleOpenChange = useCallback((open: boolean) => {
      setIsOpen(open)
      if (!open) {
        setFilterValue('')
      }
    }, [])
    const [activeIndex, setActiveIndex] = useState<number | null>(null)
    const listRef = useRef<Array<HTMLElement | null>>([])
    const listContentRef = useRef<Array<string | null>>(
      filteredFlatItems.map(item =>
        item.type === 'group-header'
          ? null
          : item.option?.disabled
          ? null
          : item.option?.label ?? null
      )
    )

    useEffect(() => {
      listContentRef.current = filteredFlatItems.map(item =>
        item.type === 'group-header'
          ? null
          : item.option?.disabled
          ? null
          : item.option?.label ?? null
      )
    }, [filteredFlatItems])

    // Reset active index when filter changes so keyboard navigation starts fresh
    useEffect(() => {
      if (searchable) {
        setActiveIndex(null)
      }
    }, [filterValue, searchable])

    const listboxId = useId()

    if (process.env.NODE_ENV !== 'production') {
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
      () => flatOptions.find(o => o.value === resolvedValue),
      [flatOptions, resolvedValue]
    )

    const selectedIndex = useMemo(() => {
      const idx = filteredFlatItems.findIndex(
        item => item.type === 'option' && item.option?.value === resolvedValue
      )
      return idx >= 0 ? idx : null
    }, [filteredFlatItems, resolvedValue])

    const disabledIndices = useMemo(
      () =>
        filteredFlatItems.reduce<number[]>((acc, item, i) => {
          if (item.type === 'group-header' || item.option?.disabled) {
            acc.push(i)
          }
          return acc
        }, []),
      [filteredFlatItems]
    )

    const { refs, floatingStyles, context } = useFloating({
      open: isOpen,
      onOpenChange: handleOpenChange,
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
      disabledIndices,
      // When searchable, suppress floating-ui's default focus-first-item
      // behaviour so the filter input can receive focus instead.
      focusItemOnOpen: searchable ? false : 'auto',
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
      // Disable floating-ui's built-in typeahead when searchable — the filter
      // input takes over character input for filtering.
      enabled: !searchable,
    })

    const { isMounted, styles: transitionStyles } = useTransitionStyles(
      context,
      {
        duration: {
          open: 100,
          close: 100,
        },
        initial: {
          opacity: 0,
          transform: 'scale(0.96)',
        },
        common: {
          transformOrigin: 'top center',
        },
      }
    )

    const { getReferenceProps, getFloatingProps, getItemProps } =
      useInteractions([click, dismiss, role, listNavigation, typeahead])

    // Auto-focus the filter input when the dropdown mounts. Depends on
    // isMounted (not isOpen) because the input is only in the DOM once
    // the transition has mounted the floating panel.
    useEffect(() => {
      if (searchable && isMounted) {
        filterInputRef.current?.focus()
      }
    }, [searchable, isMounted])

    const handleSelect = useCallback(
      (index: number) => {
        const item = filteredFlatItems[index]
        if (item?.type === 'option' && item.option && !item.option.disabled) {
          if (!isControlled) {
            setInternalValue(item.option.value)
          }
          onChange?.(item.option.value)
          setFilterValue('')
          setIsOpen(false)
          ;(refs.domReference.current as HTMLElement | null)?.focus()
        }
      },
      [filteredFlatItems, onChange, isControlled, refs]
    )

    const handleFloatingKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault()
          handleOpenChange(false)
          ;(refs.domReference.current as HTMLElement | null)?.focus()
          return
        }

        // When a list item has focus and the user types a printable character
        // or Backspace, redirect to the filter input so they can search without
        // having to manually re-focus it. Ignore modifier combos (Ctrl/Meta shortcuts).
        if (
          searchable &&
          (e.key.length === 1 || e.key === 'Backspace') &&
          !e.ctrlKey &&
          !e.metaKey &&
          e.target !== filterInputRef.current
        ) {
          filterInputRef.current?.focus()
          if (e.key === 'Backspace') {
            setFilterValue(prev => prev.slice(0, -1))
          } else {
            setFilterValue(prev => prev + e.key)
          }
          e.preventDefault()
        }
      },
      // filterInputRef is a stable ref object — excluded from deps intentionally
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [refs, handleOpenChange, searchable]
    )

    const handleFloatingBlur = useCallback(
      (e: React.FocusEvent) => {
        const relatedTarget = e.relatedTarget as Node | null
        const floating = e.currentTarget as HTMLElement
        const reference = refs.domReference.current as HTMLElement | null

        if (
          relatedTarget &&
          (floating.contains(relatedTarget) ||
            reference?.contains(relatedTarget) ||
            relatedTarget === reference)
        ) {
          return
        }

        handleOpenChange(false)
      },
      [refs, handleOpenChange]
    )

    return (
      <Block>
        <Row
          component="button"
          alignItems="center"
          justifyContent="space-between"
          gap={spacing.md}
          width="100%"
          height={formControlHeight[size]}
          boxSizing="border-box"
          padding={`${triggerPaddingV}px ${triggerPaddingH}px`}
          backgroundColor={color.bg.surface}
          border={`1px solid ${error ? color.danger : color.border.strong}`}
          borderRadius={radius.sm}
          boxShadow={shadow.xs}
          fontSize={triggerFontSize}
          lineHeight={lineHeight.relaxed}
          color={selectedOption ? color.text.default : color.text.muted}
          cursor={isDisabled ? 'not-allowed' : 'pointer'}
          opacity={isDisabled ? 0.5 : 1}
          transition={transition.fast}
          hoverBorderColor={
            isDisabled
              ? undefined
              : error
              ? color.dangerHover
              : color.border.emphasis
          }
          textAlign="left"
          {...focusRing(error ? 'danger' : 'default')}
          props={{
            ref: mergeRefs([ref, refs.setReference].filter(Boolean)),
            id,
            type: 'button',
            disabled: isDisabled,
            'aria-label': ariaLabel,
            'aria-labelledby': ariaLabelledBy,
            'aria-expanded': isOpen,
            'aria-haspopup': 'listbox' as const,
            'aria-invalid': error ? true : undefined,
            ...getReferenceProps(),
          }}
        >
          <Block
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            flex={1}
          >
            {selectedOption ? (
              renderValue ? (
                renderValue(selectedOption)
              ) : renderOption ? (
                renderOption(selectedOption, {
                  isSelected: true,
                  isActive: false,
                })
              ) : selectedOption.icon ? (
                <Row alignItems="center" gap={spacing.sm} component="span">
                  <Block
                    component="span"
                    display="inline-flex"
                    alignItems="center"
                    flexShrink={0}
                  >
                    {selectedOption.icon}
                  </Block>
                  <Block
                    component="span"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                  >
                    {selectedOption.label}
                  </Block>
                </Row>
              ) : (
                selectedOption.label
              )
            ) : (
              placeholder
            )}
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
            disabled: isDisabled,
            onChange() {},
            tabIndex: -1,
            'aria-hidden': true,
          }}
        />

        {isMounted && (
          <Portal>
            <Block
              zIndex={zIndex.portal}
              outline="none"
              props={{
                ref: refs.setFloating,
                style: floatingStyles,
                ...getFloatingProps({
                  onKeyDown: handleFloatingKeyDown,
                }),
                onBlur: handleFloatingBlur,
                'aria-label': ariaLabelledBy ? undefined : ariaLabel,
                'aria-labelledby': ariaLabelledBy ?? (id ? id : undefined),
                'aria-hidden': !isOpen,
              }}
            >
              <Block
                backgroundColor={color.bg.surface}
                borderRadius={radius.md}
                boxShadow={shadow.md}
                border={`1px solid ${color.border.strong}`}
                padding={LISTBOX_PADDING}
                overflowY="auto"
                maxHeight="inherit"
                props={{
                  style: transitionStyles,
                }}
              >
                {searchable && (
                  <Block
                    component="input"
                    display="block"
                    width="100%"
                    padding={`${spacing.sm}px ${spacing.md}px`}
                    marginBottom={spacing.sm}
                    backgroundColor={color.bg.subtle}
                    border={`1px solid ${color.border.default}`}
                    borderRadius={radius.sm}
                    fontSize={triggerFontSize}
                    lineHeight={lineHeight.relaxed}
                    color={color.text.default}
                    outline="none"
                    boxSizing="border-box"
                    props={{
                      ref: filterInputRef,
                      value: filterValue,
                      placeholder: 'Search...',
                      'aria-label': 'Filter options',
                      autoComplete: 'off',
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        setFilterValue(e.target.value)
                      },
                      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          // Select the first non-disabled option in the filtered list
                          const firstEnabledIndex = filteredFlatItems.findIndex(
                            item =>
                              item.type === 'option' && !item.option?.disabled
                          )
                          if (firstEnabledIndex >= 0) {
                            handleSelect(firstEnabledIndex)
                          }
                        } else if (
                          e.key === 'ArrowDown' ||
                          e.key === 'ArrowUp'
                        ) {
                          // Let arrow keys propagate to floating-ui list navigation
                        } else {
                          // Prevent other keys from bubbling to floating-ui
                          e.stopPropagation()
                        }
                      },
                    }}
                  />
                )}
                <Block
                  component="ul"
                  margin={spacing.none}
                  padding={spacing.none}
                  listStyleType="none"
                  props={{
                    id: listboxId,
                    role: 'presentation',
                  }}
                >
                  {filteredFlatOptions.length === 0 && searchable ? (
                    <Block
                      component="li"
                      padding={`${base}px ${base * 1.5}px`}
                      fontSize={triggerFontSize}
                      lineHeight={lineHeight.relaxed}
                      color={color.text.muted}
                      props={{
                        role: 'presentation',
                        ...({
                          'data-testid': 'select-no-results',
                        } as React.HTMLAttributes<HTMLLIElement>),
                      }}
                    >
                      No results
                    </Block>
                  ) : (
                    filteredFlatItems.map((item, index) => {
                      if (item.type === 'group-header') {
                        return (
                          <Block
                            key={item.groupId}
                            component="li"
                            padding={`${base * 0.75}px ${base * 1.5}px`}
                            fontSize={triggerFontSize * 0.85}
                            lineHeight={lineHeight.relaxed}
                            fontWeight={600}
                            color={color.text.muted}
                            props={{
                              ref: (node: HTMLElement | null) => {
                                listRef.current[index] = node
                              },
                              role: 'presentation',
                              id: item.groupId,
                              'aria-hidden': true,
                            }}
                          >
                            {item.groupLabel}
                          </Block>
                        )
                      }

                      const option = item.option!
                      const isSelected = option.value === resolvedValue
                      const isActive = activeIndex === index
                      const isOptionDisabled = option.disabled === true

                      return (
                        <Row
                          key={option.value}
                          component="li"
                          alignItems="center"
                          justifyContent="space-between"
                          gap={spacing.sm}
                          padding={`${base}px ${base * 1.5}px`}
                          paddingLeft={item.groupId ? base * 2.5 : base * 1.5}
                          fontSize={triggerFontSize}
                          lineHeight={lineHeight.relaxed}
                          borderRadius={radius.sm}
                          outline="none"
                          cursor={isOptionDisabled ? 'not-allowed' : 'pointer'}
                          color={
                            isOptionDisabled
                              ? color.text.muted
                              : isSelected
                              ? color.primary
                              : color.text.default
                          }
                          backgroundColor={
                            isActive && !isOptionDisabled && isSelected
                              ? color.primarySubtleHover
                              : isActive && !isOptionDisabled
                              ? color.bg.hover
                              : isSelected
                              ? color.primarySubtle
                              : 'transparent'
                          }
                          opacity={isOptionDisabled ? 0.5 : 1}
                          props={{
                            ref: (node: HTMLElement | null) => {
                              listRef.current[index] = node
                            },
                            role: 'option',
                            'aria-selected': isSelected,
                            'aria-disabled': isOptionDisabled || undefined,
                            tabIndex: !isOptionDisabled && isActive ? 0 : -1,
                            ...getItemProps({
                              onClick: () => {
                                if (!isOptionDisabled) {
                                  handleSelect(index)
                                }
                              },
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if (
                                  (e.key === 'Enter' || e.key === ' ') &&
                                  !isOptionDisabled
                                ) {
                                  e.preventDefault()
                                  handleSelect(index)
                                }
                              },
                            }),
                          }}
                        >
                          <Block flex={1}>
                            {renderOption ? (
                              renderOption(option, { isSelected, isActive })
                            ) : option.icon ? (
                              <Row
                                alignItems="center"
                                gap={spacing.sm}
                                component="span"
                              >
                                <Block
                                  component="span"
                                  display="inline-flex"
                                  alignItems="center"
                                  flexShrink={0}
                                >
                                  {option.icon}
                                </Block>
                                <Block component="span">{option.label}</Block>
                              </Row>
                            ) : (
                              option.label
                            )}
                          </Block>
                          {isSelected && (
                            <Block
                              flexShrink={0}
                              display="flex"
                              alignItems="center"
                            >
                              <Check
                                size={Math.max(base * 1.5, 12)}
                                color={color.primary}
                              />
                            </Block>
                          )}
                        </Row>
                      )
                    })
                  )}
                </Block>
              </Block>
            </Block>
          </Portal>
        )}
      </Block>
    )
  }
)

Select.displayName = 'Select'
