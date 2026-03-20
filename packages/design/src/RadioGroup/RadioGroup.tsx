import React, { forwardRef } from 'react'
import { RadioGroup as CatalystRadioGroup } from '~/catalyst/radio'
import { Legend } from '~/catalyst/fieldset'

export interface RadioGroupProps {
  label: string
  value: string
  onChange(value: string): void
  disabled?: boolean
  size?: 'small' | 'medium' | 'large'
  children: React.ReactNode
}

export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(
  ({ label, value, onChange, disabled = false, children }, ref) => {
    return (
      <fieldset
        className="space-y-4"
        ref={ref}
        disabled={disabled || undefined}
      >
        <Legend>{label}</Legend>
        <CatalystRadioGroup value={value} onChange={onChange} disabled={disabled}>
          {children}
        </CatalystRadioGroup>
      </fieldset>
    )
  }
)

RadioGroup.displayName = 'RadioGroup'
