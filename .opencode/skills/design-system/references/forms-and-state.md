# Forms & State Management

## Label + Input Composition (Required Pattern)

Every label + input pair must be wrapped in `<FormField>`. This standardizes spacing (`gap: spacing.md`), auto-wires `id`/`htmlFor` via context, and provides `aria-describedby` linking to error/help text.

For the 90% case — a single labelled text `Input` with optional help and error — use `<TextField>` from `@repro/design`. It composes `FormField` + `Label` + `Input` + optional help text + `FormFieldError` in one component.

```tsx
import { TextField } from '@repro/design'

<TextField
  label="Recording title"
  value={title}
  onChange={e => setTitle(e.currentTarget.value)}
  placeholder="What did you record?"
  help="A short description helps identify the recording later."
  invalid={!!error}
  error={error}
/>
```

For complex compositions (multiple inputs, custom controls, `trailingAction`, or when `context="error"` on the Input must differ from `invalid` on FormField), fall back to composing `FormField` + `Label` + `Input` directly:

```tsx
import { FormField, FormFieldError, Input, Label } from '@repro/design'

<FormField invalid={!!error}>
  <Label>Recording title</Label>
  <Input
    value={title}
    onChange={e => setTitle(e.currentTarget.value)}
    placeholder="What did you record?"
  />
  <Block>Optional helper content</Block>
  {error && <FormFieldError error={error} />}
</FormField>
```

**Do not** compose a bare `<label>` + `<Input>` without `FormField` — it loses spacing, context wiring, and accessibility plumbing.

---

## Form Composition Pattern

Forms use `react-hook-form` + `zod` for validation.

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, FormFieldError, Input, color, spacing } from '@repro/design'
import { Col } from '@jsxstyle/react'
import { FormProvider, useForm } from 'react-hook-form'
import z from 'zod'

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

type FormState = z.infer<typeof formSchema>

function LoginForm() {
  const methods = useForm<FormState>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  const { register, formState, handleSubmit } = methods

  function onSubmit(data: FormState) {
    // Handle submission (Fluture-based async — see code-style in AGENTS.md)
  }

  return (
    <FormProvider {...methods}>
      <Col component="form" gap={spacing.xl} props={{ onSubmit: handleSubmit(onSubmit) }}>
        <Col gap={spacing.sm}>
          <Input
            label="Email"
            type="email"
            context={formState.errors.email != null ? 'error' : 'normal'}
            {...register('email')}
          />
          {formState.errors.email && (
            <FormFieldError error={formState.errors.email} />
          )}
        </Col>

        <Col gap={spacing.sm}>
          <Input
            label="Password"
            type="password"
            context={formState.errors.password != null ? 'error' : 'normal'}
            {...register('password')}
          />
          {formState.errors.password && (
            <FormFieldError error={formState.errors.password} />
          )}
        </Col>

        <Button type="submit" disabled={formState.isSubmitting}>
          Log In
        </Button>
      </Col>
    </FormProvider>
  )
}
```

**Key rules:**
- Define Zod schema, derive `FormState` type with `z.infer<typeof schema>`
- Pass `zodResolver(schema)` to `useForm`
- Spread `register('field')` onto `<Input>` — no `Controller` needed
- Set `context="error"` on `<Input>` when `formState.errors.field != null`
- Use `<FormFieldError>` for error messages
- Disable submit button with `formState.isSubmitting`
- Cross-field validation: use `.refine()` on the Zod schema with a `path` array

---

## State Management with `@repro/atom`

Observable state primitives built on RxJS `BehaviorSubject`. Works in both React and imperative code.

```tsx
import { atom, createAtom, useAtomValue, useAtomState, useSelector, Atom, Setter } from '@repro/atom'
```

| Export | Purpose |
|--------|---------|
| `createAtom<T>(val)` | Primary factory. Returns `[$atom, setter, getter]` tuple. |
| `atom<T>(val)` | Creates a standalone `BehaviorSubject`. For context defaults and fixtures. |
| `atom.from(observable, initial)` | Creates an atom mirroring an RxJS observable. |
| `useAtomValue($atom)` | React hook — read-only subscription. |
| `useAtomState($atom)` | React hook — returns `[value, setter]` (like `useState`). |
| `useSelector($atom, selector)` | React hook — derived read with selector function. |
| `useSetAtomValue($atom)` | React hook — write-only (returns setter). |

**Naming conventions:**
- Atoms: `$`-prefixed (`$elapsed`, `$readyState`)
- Setters: `set`-prefixed (`setElapsed`, `setReadyState`)
- Getters: `get`-prefixed, used only in imperative code (`getElapsed`)

**Standard pattern — `createState()` factory:**

```tsx
// createState.ts
import { Atom, createAtom, Setter } from '@repro/atom'

export interface State {
  $view: Atom<View>
  setView: Setter<View>
}

export function createState(): State {
  const [$view, setView] = createAtom<View>(View.Default)
  return { $view, setView }
}
```

```tsx
// context.tsx
export const StateContext = React.createContext<State>(createState())
```

```tsx
// hooks.ts
export function useView() {
  const { $view } = useContext(StateContext)
  return useAtomValue($view)
}
```

---

## Loading, Empty, and Error States

```tsx
import { Alert, FX, color, spacing, radius, textStyles } from '@repro/design'
import { Loader as LoaderIcon } from 'lucide-react'
import { Block, Col, Row } from '@jsxstyle/react'

// Loading
<Row justifyContent="center" padding={spacing['2xl']}>
  <FX.Spin>
    <LoaderIcon size={24} />
  </FX.Spin>
</Row>

// Empty state
<Col alignItems="center" padding={spacing['3xl']} gap={spacing.md}>
  <Block {...textStyles.body} color={color.text.muted}>
    No items found.
  </Block>
</Col>

// Error state (inline)
<Alert type="danger">
  Something went wrong. Please try again.
</Alert>

// Error state (form-level banner)
{errorMessage && (
  <Block
    padding={spacing.lg}
    backgroundColor={color.dangerSubtle}
    color={color.danger}
    borderRadius={radius.sm}
    borderColor={color.danger}
    borderStyle="solid"
    borderWidth={1}
  >
    {errorMessage}
  </Block>
)}
```
