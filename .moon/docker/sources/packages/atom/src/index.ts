import { useCallback, useEffect, useRef, useState } from 'react'
import { BehaviorSubject, Observable } from 'rxjs'
import { distinctUntilChanged, map } from 'rxjs/operators'

export type Atom<T> = BehaviorSubject<T>
export type ReadonlyAtom<T> = Observable<T>

export function atom<T>(val: T): Atom<T> {
  return new BehaviorSubject(val)
}

function createGetter<T>(atom: Atom<T>) {
  return () => atom.getValue()
}

type Factory<T> = (prev: T) => T

function isValueFactory<T>(val: T | Factory<T>): val is Factory<T> {
  return typeof val === 'function'
}

export type Setter<T> = (val: T | Factory<T>) => void

function createSetter<T>(atom: Atom<T>): Setter<T> {
  return (val: T | Factory<T>) => {
    atom.next(isValueFactory(val) ? val(atom.getValue()) : val)
  }
}

export function createAtom<T>(val: T) {
  const $atom = atom(val)
  return [$atom, createSetter($atom), createGetter($atom)] as const
}

type AtomState<T> = [T, (val: T | Factory<T>) => void]

export function useAtomState<T>(atom: Atom<T>): AtomState<T> {
  const [value, setValue] = useState(atom.getValue())

  useEffect(() => {
    const subscription = atom
      .pipe(/*observeOn(asyncScheduler),*/ distinctUntilChanged())
      .subscribe(setValue)
    return () => subscription.unsubscribe()
  }, [atom, setValue])

  return [value, useCallback(createSetter(atom), [atom])]
}

export function useAtomValue<T>(atom: Atom<T>) {
  return useAtomState(atom)[0]
}

export function useSetAtomValue<T>(atom: Atom<T>) {
  return useAtomState(atom)[1]
}

export function createValueHook<T>(atom: Atom<T>) {
  return () => useAtomValue(atom)
}

export function useSelector<T, U>(atom: Atom<T>, selector: (value: T) => U) {
  const selectorRef = useRef(selector)
  const [value, setValue] = useState(selector(atom.getValue()))

  useEffect(() => {
    const subscription = atom
      .pipe(/* observeOn(asyncScheduler), */ map(selectorRef.current))
      .subscribe(setValue)
    return () => subscription.unsubscribe()
  }, [atom, selectorRef, setValue])

  return value
}

export function createSelectorHook<T, U>(
  atom: Atom<T>,
  selector: (value: T) => U
) {
  return () => useSelector(atom, selector)
}
