import React from 'react'
import {
  Fieldset as CatalystFieldset,
  FieldGroup,
  Legend,
} from '~/catalyst/fieldset'

interface FieldsetProps {
  heading?: string
  children?: React.ReactNode
}

export const Fieldset: React.FC<FieldsetProps> = ({ heading, children }) => {
  return (
    <CatalystFieldset>
      {heading != null && <Legend>{heading}</Legend>}
      <FieldGroup>{children}</FieldGroup>
    </CatalystFieldset>
  )
}

Fieldset.displayName = 'Fieldset'
