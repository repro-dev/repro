// Shared CSF story-shaping helpers for scripts/render-stories-html.ts.
//
// Kept free of runtime react imports (`import type` only) so test harnesses
// run by plain `node --test` can exercise these functions without react being
// resolvable from scripts/ (the render harness itself runs under tsx, which
// resolves the pnpm virtual store).
import type { ReactElement, ReactNode } from 'react'

export type StoryComponent = (
  props: Record<string, unknown>
) => ReactNode | ReactElement

/** Accept plain objects only (no arrays, no class instances worth guarding). */
export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * CSF meta-level `default.args` are story defaults: merge them UNDER each
 * story's own args (story wins), matching Storybook semantics. Non-plain
 * -object values on either side contribute nothing.
 */
export function mergeStoryArgs(
  metaArgs: unknown,
  storyArgs: unknown
): Record<string, unknown> {
  return {
    ...(isPlainObject(metaArgs) ? metaArgs : {}),
    ...(isPlainObject(storyArgs) ? storyArgs : {}),
  }
}

/**
 * CSF decorators wrap the story element: the FIRST decorator in the array is
 * the outermost wrapper. Each decorator receives a Story function returning
 * the story tree composed SO FAR plus the story context.
 *
 * The Story closure must snapshot the composed tree at decoration time. A
 * live binding to the accumulator variable recurses infinitely when a
 * decorator renders `<Story />`: by render time the accumulator IS the
 * decorator's own output, which contains `<Story />` (REP-1657 — this is what
 * surfaced as stack-overflow render failures on LoadingState,
 * FullPageError.FullPage, ErrorBoundary.Default and
 * ConfirmDialog.ImperativeHook).
 */
export function applyStoryDecorators(
  element: ReactElement,
  decorators: unknown[],
  story: Record<string, unknown>
): ReactElement {
  const context = {
    args: isPlainObject(story.args) ? story.args : {},
    parameters: story.parameters,
    id: story.name,
  }
  let current: ReactNode = element
  for (const decorator of [...decorators].reverse()) {
    if (typeof decorator !== 'function') continue
    const composed: ReactNode = current
    const Story = (): ReactNode => composed
    const wrapped = (
      decorator as (story: () => ReactNode, context: unknown) => ReactNode
    )(Story, context)
    if (wrapped !== undefined && wrapped !== null) current = wrapped
  }
  return current as ReactElement
}
