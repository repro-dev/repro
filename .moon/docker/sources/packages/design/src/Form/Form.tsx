import React from 'react'

import {
  FormProvider as BaseFormProvider,
  FormProviderProps,
} from 'react-hook-form'

export const FormProvider: React.FC<FormProviderProps> = props => {
  return <BaseFormProvider {...props} />
}
