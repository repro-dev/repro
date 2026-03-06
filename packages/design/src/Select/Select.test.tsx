import { cleanup, fireEvent, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React, { act } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { FormFieldError } from '../FormFieldError/FormFieldError'
import { Label } from '../Label/Label'
import { PortalRootProvider } from '../Portal/PortalRootProvider'
import { Select, type SelectOption } from './Select'

afterEach(cleanup)

const options: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
]

describe('Select — external Label (REP-307)', () => {
  it('renders the trigger without a bundled label element', () => {
    render(
      <Select
        value=""
        onChange={() => {}}
        options={options}
        aria-label="Fruit"
      />
    )

    const labels = document.querySelectorAll('label')
    expect(labels.length).toBe(0)
  })

  it('does not accept a label prop', () => {
    const props = {
      value: '',
      onChange: () => {},
      options,
      'aria-label': 'Fruit',
    } as Record<string, unknown>

    expect('label' in props).toBe(false)
  })

  it('associates an external Label via id and aria-labelledby', () => {
    render(
      <>
        <Label htmlFor="fruit-select">Fruit</Label>
        <Select
          id="fruit-select"
          value=""
          onChange={() => {}}
          options={options}
        />
      </>
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.getAttribute('id')).toBe('fruit-select')

    const label = document.querySelector('label')
    expect(label).not.toBeNull()
    expect(label!.getAttribute('for')).toBe('fruit-select')
  })

  it('supports aria-label for cases without a visible label', () => {
    render(
      <Select
        value=""
        onChange={() => {}}
        options={options}
        aria-label="Choose a fruit"
      />
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.getAttribute('aria-label')).toBe('Choose a fruit')
  })

  it('supports aria-labelledby for external label association', () => {
    render(
      <>
        <span id="custom-label">Pick a fruit</span>
        <Select
          value=""
          onChange={() => {}}
          options={options}
          aria-labelledby="custom-label"
        />
      </>
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.getAttribute('aria-labelledby')).toBe('custom-label')
  })

  it('warns in development when no accessible label is provided', () => {
    const warn = mock.fn()
    const originalWarn = console.warn
    console.warn = warn

    render(<Select value="" onChange={() => {}} options={options} />)

    console.warn = originalWarn

    expect(warn.mock.callCount()).toBeGreaterThan(0)
    expect(String(warn.mock.calls[0]?.arguments[0])).toMatch(/Select.*label/i)
  })

  it('passes the listbox aria-labelledby to match the trigger id', () => {
    render(
      <PortalRootProvider>
        <Select
          id="fruit-select"
          value=""
          onChange={() => {}}
          options={options}
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!
    expect(trigger.getAttribute('id')).toBe('fruit-select')

    act(() => {
      trigger.click()
    })

    const listbox = document.querySelector('[role="listbox"]')
    expect(listbox).not.toBeNull()
    expect(listbox!.getAttribute('aria-labelledby')).toBe('fruit-select')
  })

  it('passes aria-label to the listbox when no aria-labelledby or id is provided', () => {
    render(
      <PortalRootProvider>
        <Select
          value=""
          onChange={() => {}}
          options={options}
          aria-label="Choose a fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const listbox = document.querySelector('[role="listbox"]')
    expect(listbox).not.toBeNull()
    expect(listbox!.getAttribute('aria-label')).toBe('Choose a fruit')
  })
})

describe('Select — controlled and uncontrolled modes (REP-296)', () => {
  it('controlled mode reflects external value', () => {
    render(
      <Select
        value="banana"
        onChange={() => {}}
        options={options}
        aria-label="Fruit"
      />
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.textContent).toContain('Banana')
  })

  it('controlled mode calls onChange but does not update display without external re-render', () => {
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          value="apple"
          onChange={onChange}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!
    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    act(() => {
      ;(optionElements[1] as HTMLElement).click()
    })

    expect(onChange.mock.callCount()).toBe(1)
    expect(onChange.mock.calls[0]?.arguments[0]).toBe('banana')
  })

  it('uncontrolled mode manages internal state with defaultValue', () => {
    render(<Select defaultValue="apple" options={options} aria-label="Fruit" />)

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.textContent).toContain('Apple')
  })

  it('uncontrolled mode updates display on selection', () => {
    render(
      <PortalRootProvider>
        <Select defaultValue="apple" options={options} aria-label="Fruit" />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    act(() => {
      ;(optionElements[2] as HTMLElement).click()
    })

    expect(trigger.textContent).toContain('Cherry')
  })

  it('uncontrolled mode calls onChange on selection', () => {
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          defaultValue="apple"
          onChange={onChange}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    act(() => {
      ;(optionElements[1] as HTMLElement).click()
    })

    expect(onChange.mock.callCount()).toBe(1)
    expect(onChange.mock.calls[0]?.arguments[0]).toBe('banana')
  })

  it('warns when switching from uncontrolled to controlled', () => {
    const warn = mock.fn()
    const originalWarn = console.warn
    console.warn = warn

    const { rerender } = render(
      <Select defaultValue="apple" options={options} aria-label="Fruit" />
    )

    rerender(
      <Select
        value="banana"
        onChange={() => {}}
        options={options}
        aria-label="Fruit"
      />
    )

    console.warn = originalWarn

    const warnings = warn.mock.calls.map(c => String(c.arguments[0]))
    const switchWarning = warnings.find(
      w => /controlled/i.test(w) && /uncontrolled/i.test(w)
    )
    expect(switchWarning).toBeDefined()
  })

  it('renders with no value and shows placeholder when uncontrolled with no defaultValue', () => {
    render(
      <Select options={options} aria-label="Fruit" placeholder="Pick one" />
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.textContent).toContain('Pick one')
  })
})

describe('Select — required attribute and hidden input (REP-293)', () => {
  it('renders a hidden input with required attribute when required prop is set', () => {
    render(
      <Select
        value="apple"
        onChange={() => {}}
        options={options}
        name="fruit"
        required
        aria-label="Fruit"
      />
    )

    const hiddenInput = document.querySelector(
      'input[name="fruit"]'
    ) as HTMLInputElement
    expect(hiddenInput).not.toBeNull()
    expect(hiddenInput.required).toBe(true)
  })

  it('hidden input value reflects the selected value', () => {
    render(
      <Select
        value="banana"
        onChange={() => {}}
        options={options}
        name="fruit"
        aria-label="Fruit"
      />
    )

    const hiddenInput = document.querySelector(
      'input[name="fruit"]'
    ) as HTMLInputElement
    expect(hiddenInput).not.toBeNull()
    expect(hiddenInput.value).toBe('banana')
  })

  it('native form validation prevents submission when no value is selected and required is true', () => {
    const onSubmit = mock.fn()

    render(
      <form
        onSubmit={e => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <Select options={options} name="fruit" required aria-label="Fruit" />
        <button type="submit">Submit</button>
      </form>
    )

    const submitButton = document.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement

    act(() => {
      submitButton.click()
    })

    expect(onSubmit.mock.callCount()).toBe(0)
  })

  it('hidden input is visually hidden but present in the DOM', () => {
    render(
      <Select
        value="apple"
        onChange={() => {}}
        options={options}
        name="fruit"
        aria-label="Fruit"
      />
    )

    const hiddenInput = document.querySelector(
      'input[name="fruit"]'
    ) as HTMLInputElement
    expect(hiddenInput).not.toBeNull()
    expect(hiddenInput.tabIndex).toBe(-1)
    expect(hiddenInput.getAttribute('aria-hidden')).toBe('true')
  })

  it('hidden input uses name prop', () => {
    render(
      <Select
        value="cherry"
        onChange={() => {}}
        options={options}
        name="my-select"
        aria-label="Fruit"
      />
    )

    const hiddenInput = document.querySelector(
      'input[name="my-select"]'
    ) as HTMLInputElement
    expect(hiddenInput).not.toBeNull()
    expect(hiddenInput.value).toBe('cherry')
  })

  it('hidden input is disabled when Select is disabled', () => {
    render(
      <Select
        value="apple"
        onChange={() => {}}
        options={options}
        name="fruit"
        disabled
        aria-label="Fruit"
      />
    )

    const hiddenInput = document.querySelector(
      'input[name="fruit"]'
    ) as HTMLInputElement
    expect(hiddenInput).not.toBeNull()
    expect(hiddenInput.disabled).toBe(true)
  })
})

describe('Select — keyboard selection (REP-309)', () => {
  it('Enter key on active option triggers selection and closes dropdown', () => {
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          value=""
          onChange={onChange}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    expect(optionElements.length).toBe(3)

    act(() => {
      fireEvent.keyDown(optionElements[1] as HTMLElement, { key: 'Enter' })
    })

    expect(onChange.mock.callCount()).toBe(1)
    expect(onChange.mock.calls[0]?.arguments[0]).toBe('banana')

    const listbox = document.querySelector('[role="listbox"]')
    expect(listbox).toBeNull()
  })

  it('Space key on active option triggers selection and closes dropdown', () => {
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          value=""
          onChange={onChange}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')

    act(() => {
      fireEvent.keyDown(optionElements[2] as HTMLElement, { key: ' ' })
    })

    expect(onChange.mock.callCount()).toBe(1)
    expect(onChange.mock.calls[0]?.arguments[0]).toBe('cherry')

    const listbox = document.querySelector('[role="listbox"]')
    expect(listbox).toBeNull()
  })

  it('Arrow down then Enter selects the navigated-to option', () => {
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          value=""
          onChange={onChange}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    expect(optionElements.length).toBe(3)

    act(() => {
      fireEvent.keyDown(optionElements[0] as HTMLElement, { key: 'ArrowDown' })
    })

    act(() => {
      fireEvent.keyDown(optionElements[1] as HTMLElement, { key: 'Enter' })
    })

    expect(onChange.mock.callCount()).toBe(1)
    expect(onChange.mock.calls[0]?.arguments[0]).toBe('banana')
  })

  it('focus returns to trigger after click selection', () => {
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          value=""
          onChange={onChange}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')

    act(() => {
      ;(optionElements[1] as HTMLElement).click()
    })

    expect(document.activeElement).toBe(trigger)
  })

  it('focus returns to trigger after keyboard selection', () => {
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          value=""
          onChange={onChange}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')

    act(() => {
      fireEvent.keyDown(optionElements[1] as HTMLElement, { key: 'Enter' })
    })

    expect(document.activeElement).toBe(trigger)
  })

  it('keyboard selection skips disabled options', () => {
    const optionsWithDisabled: SelectOption[] = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
      { value: 'c', label: 'C' },
    ]
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          value=""
          onChange={onChange}
          options={optionsWithDisabled}
          aria-label="Test"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const disabledOption = document.querySelectorAll(
      '[role="option"]'
    )[1] as HTMLElement
    expect(disabledOption.getAttribute('aria-disabled')).toBe('true')

    act(() => {
      fireEvent.keyDown(disabledOption, { key: 'Enter' })
    })

    expect(onChange.mock.callCount()).toBe(0)
  })
})

describe('Select — selected checkmark indicator (REP-291)', () => {
  it('checkmark renders on the selected option', () => {
    render(
      <PortalRootProvider>
        <Select
          value="banana"
          onChange={() => {}}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!
    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    const selectedOption = optionElements[1] as HTMLElement
    const checkIcon = selectedOption.querySelector('svg')
    expect(checkIcon).not.toBeNull()
  })

  it('checkmark does not render on unselected options', () => {
    render(
      <PortalRootProvider>
        <Select
          value="banana"
          onChange={() => {}}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!
    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    const unselectedOption = optionElements[0] as HTMLElement
    const checkIcon = unselectedOption.querySelector('svg')
    expect(checkIcon).toBeNull()
  })

  it('checkmark moves to newly selected option after selection change', () => {
    const { rerender } = render(
      <PortalRootProvider>
        <Select
          value="apple"
          onChange={() => {}}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!
    act(() => {
      trigger.click()
    })

    let optionElements = document.querySelectorAll('[role="option"]')
    expect(
      (optionElements[0] as HTMLElement).querySelector('svg')
    ).not.toBeNull()
    expect((optionElements[1] as HTMLElement).querySelector('svg')).toBeNull()

    act(() => {
      trigger.click()
    })

    rerender(
      <PortalRootProvider>
        <Select
          value="cherry"
          onChange={() => {}}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    act(() => {
      trigger.click()
    })

    optionElements = document.querySelectorAll('[role="option"]')
    expect((optionElements[0] as HTMLElement).querySelector('svg')).toBeNull()
    expect(
      (optionElements[2] as HTMLElement).querySelector('svg')
    ).not.toBeNull()
  })

  it('checkmark is visible in all size variants', () => {
    const sizes = ['small', 'medium', 'large'] as const

    for (const size of sizes) {
      cleanup()

      render(
        <PortalRootProvider>
          <Select
            value="apple"
            onChange={() => {}}
            options={options}
            size={size}
            aria-label="Fruit"
          />
        </PortalRootProvider>
      )

      const trigger = document.querySelector('button')!
      act(() => {
        trigger.click()
      })

      const optionElements = document.querySelectorAll('[role="option"]')
      const selectedOption = optionElements[0] as HTMLElement
      const checkIcon = selectedOption.querySelector('svg')
      expect(checkIcon).not.toBeNull()
    }
  })
})

describe('Select — error state (REP-292)', () => {
  it('error styling applies when error={true}', () => {
    render(
      <Select
        value=""
        onChange={() => {}}
        options={options}
        error
        aria-label="Fruit"
      />
    )

    const trigger = document.querySelector('button')!
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
  })

  it('does not render error messages (consumer responsibility)', () => {
    render(
      <Select
        value=""
        onChange={() => {}}
        options={options}
        error
        aria-label="Fruit"
      />
    )

    const trigger = document.querySelector('button')!
    expect(trigger.getAttribute('aria-invalid')).toBe('true')

    const errorMessage = document.querySelector('[role="alert"]')
    expect(errorMessage).toBeNull()
  })

  it('no error styling when error is not set or is false', () => {
    render(
      <Select
        value=""
        onChange={() => {}}
        options={options}
        aria-label="Fruit"
      />
    )

    const trigger = document.querySelector('button')!
    expect(trigger.getAttribute('aria-invalid')).toBeNull()

    const errorMessage = document.querySelector('[role="alert"]')
    expect(errorMessage).toBeNull()
  })

  it('no error styling when error is false', () => {
    render(
      <Select
        value=""
        onChange={() => {}}
        options={options}
        error={false}
        aria-label="Fruit"
      />
    )

    const trigger = document.querySelector('button')!
    expect(trigger.getAttribute('aria-invalid')).toBeNull()
  })
})

describe('Select — empty options handling (REP-295)', () => {
  it('does not throw when options is an empty array', () => {
    expect(() => {
      render(
        <Select value="" onChange={() => {}} options={[]} aria-label="Fruit" />
      )
    }).not.toThrow()
  })

  it('trigger is disabled when options are empty', () => {
    render(
      <Select value="" onChange={() => {}} options={[]} aria-label="Fruit" />
    )

    const trigger = document.querySelector('button')!
    expect(trigger.disabled).toBe(true)
  })

  it('trigger becomes enabled when options are later populated', () => {
    const { rerender } = render(
      <Select value="" onChange={() => {}} options={[]} aria-label="Fruit" />
    )

    const trigger = document.querySelector('button')!
    expect(trigger.disabled).toBe(true)

    rerender(
      <Select
        value=""
        onChange={() => {}}
        options={options}
        aria-label="Fruit"
      />
    )

    expect(trigger.disabled).toBe(false)
  })
})

describe('Select — react-hook-form integration (REP-294)', () => {
  function ControllerForm({
    onSubmit,
    defaultValue = '',
  }: {
    onSubmit: (data: { fruit: string }) => void
    defaultValue?: string
  }) {
    const { control, handleSubmit } = useForm({
      defaultValues: { fruit: defaultValue },
    })

    return (
      <form onSubmit={handleSubmit(onSubmit)}>
        <PortalRootProvider>
          <Controller
            name="fruit"
            control={control}
            rules={{ required: 'Please select a fruit' }}
            render={({ field, fieldState }) => (
              <>
                <Select
                  value={field.value}
                  onChange={field.onChange}
                  name={field.name}
                  options={options}
                  error={!!fieldState.error}
                  aria-label="Fruit"
                />
                {fieldState.error && (
                  <FormFieldError error={fieldState.error} />
                )}
              </>
            )}
          />
        </PortalRootProvider>
        <button type="submit">Submit</button>
      </form>
    )
  }

  it('Controller wrapper correctly controls Select value', () => {
    const onSubmit = mock.fn()

    render(<ControllerForm onSubmit={onSubmit} defaultValue="banana" />)

    const trigger = document.querySelector('button[aria-haspopup="listbox"]')!
    expect(trigger.textContent).toContain('Banana')
  })

  it('form submission includes the selected value via Controller', async () => {
    const onSubmit = mock.fn()

    render(<ControllerForm onSubmit={onSubmit} defaultValue="cherry" />)

    const submitButton = document.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement

    await act(async () => {
      submitButton.click()
    })

    expect(onSubmit.mock.callCount()).toBe(1)
    expect(onSubmit.mock.calls[0]?.arguments[0]).toEqual({ fruit: 'cherry' })
  })

  it('Controller selection updates form value and submits correctly', async () => {
    const onSubmit = mock.fn()

    render(<ControllerForm onSubmit={onSubmit} />)

    const trigger = document.querySelector('button[aria-haspopup="listbox"]')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    act(() => {
      ;(optionElements[0] as HTMLElement).click()
    })

    const submitButton = document.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement

    await act(async () => {
      submitButton.click()
    })

    expect(onSubmit.mock.callCount()).toBe(1)
    expect(onSubmit.mock.calls[0]?.arguments[0]).toEqual({ fruit: 'apple' })
  })

  it('validation errors propagate when field is required and empty', async () => {
    const onSubmit = mock.fn()

    render(<ControllerForm onSubmit={onSubmit} />)

    const submitButton = document.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement

    await act(async () => {
      submitButton.click()
    })

    expect(onSubmit.mock.callCount()).toBe(0)

    const errorMessage = document.querySelector('[role="alert"]')
    expect(errorMessage).not.toBeNull()
    expect(errorMessage!.textContent).toBe('Please select a fruit')
  })

  it('register() works via the hidden input for form submission', async () => {
    const onSubmit = mock.fn()

    function RegisterForm() {
      const { register, handleSubmit } = useForm({
        defaultValues: { fruit: 'banana' },
      })

      return (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Select
            defaultValue="banana"
            options={options}
            aria-label="Fruit"
            {...register('fruit')}
          />
          <button type="submit">Submit</button>
        </form>
      )
    }

    render(<RegisterForm />)

    const hiddenInput = document.querySelector(
      'input[name="fruit"]'
    ) as HTMLInputElement
    expect(hiddenInput).not.toBeNull()
    expect(hiddenInput.value).toBe('banana')

    const submitButton = document.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement

    await act(async () => {
      submitButton.click()
    })

    expect(onSubmit.mock.callCount()).toBe(1)
    expect(onSubmit.mock.calls[0]?.arguments[0]).toEqual({ fruit: 'banana' })
  })
})
