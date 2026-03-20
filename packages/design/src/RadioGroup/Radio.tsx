import React from 'react'
import { Radio as CatalystRadio, RadioField } from '~/catalyst/radio'
import { Description, Label } from '~/catalyst/fieldset'

export interface RadioProps {
  value: string
  label: string
  disabled?: boolean
  description?: string
}

export const Radio: React.FC<RadioProps> = ({
  value,
  label,
  disabled = false,
  description,
}) => {
  return (
    <RadioField>
      <CatalystRadio value={value} disabled={disabled} />
      <Label>{label}</Label>
      {description && <Description>{description}</Description>}
    </RadioField>
  )
}

Radio.displayName = 'Radio'
