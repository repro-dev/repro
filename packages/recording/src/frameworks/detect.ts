export interface DetectedFrameworks {
  react: boolean
  redux: boolean
  vue: boolean
  zustand: boolean
}

// Checks if the given object has the Redux store shape:
// dispatch, getState, and subscribe must all be functions.
function hasReduxStoreShape(obj: unknown): boolean {
  if (obj == null || typeof obj !== 'object') return false
  const candidate = obj as Record<string, unknown>
  return (
    typeof candidate['dispatch'] === 'function' &&
    typeof candidate['getState'] === 'function' &&
    typeof candidate['subscribe'] === 'function'
  )
}

export function detectFrameworks(
  win: typeof globalThis = globalThis
): DetectedFrameworks {
  const w = win as Record<string, unknown>

  const react = w['__REACT_DEVTOOLS_GLOBAL_HOOK__'] != null

  const redux =
    w['__REDUX_DEVTOOLS_EXTENSION__'] != null ||
    w['__redux_store__'] != null ||
    hasReduxStoreShape(w['__store']) ||
    hasReduxStoreShape(w['store']) ||
    hasReduxStoreShape(w['__redux'])

  const vue = w['__VUE__'] != null || w['Vue'] != null

  const zustand = w['__zustand'] != null || w['__ZUSTAND_STORE__'] != null

  return { react, redux, vue, zustand }
}
