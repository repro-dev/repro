import { Atom, createAtom, Setter } from '@repro/atom'
import { SyntheticId } from '@repro/domain'
import { INITIAL_SIZE } from './constants'
import { MutableNodeMap, Snap, View } from './types'

export interface State {
  $inspecting: Atom<boolean>
  $picker: Atom<boolean>
  $currentDocument: Atom<Document | null>
  $nodeMap: Atom<MutableNodeMap>
  $focusedNode: Atom<SyntheticId | null>
  $selectedNode: Atom<SyntheticId | null>
  $view: Atom<View>
  $mask: Atom<boolean>
  $size: Atom<number>
  $snap: Atom<Snap>

  $consoleSearch: Atom<string>
  $consoleLevelFilter: Atom<number>

  setInspecting: Setter<boolean>
  setPicker: Setter<boolean>
  setCurrentDocument: Setter<Document | null>
  setNodeMap: Setter<MutableNodeMap>
  setFocusedNode: Setter<SyntheticId | null>
  setSelectedNode: Setter<SyntheticId | null>
  setView: Setter<View>
  setMask: Setter<boolean>
  setSize: Setter<number>
  setSnap: Setter<Snap>

  setConsoleSearch: Setter<string>
  setConsoleLevelFilter: Setter<number>
}

const defaultValues = {
  inspecting: true,
  picker: false,
  currentDocument: null,
  focusedNode: null,
  selectedNode: null,
  view: View.Elements,
  mask: false,
  size: INITIAL_SIZE,
  snap: 'bottom' as Snap,
  consoleSearch: '',
  consoleLevelFilter: 14, // bit-mask for Info (2), Warning (4) and Error(8),
}

export function createState(
  initialValues: Partial<typeof defaultValues> = defaultValues
): State {
  const [$inspecting, setInspecting] = createAtom(
    initialValues.inspecting ?? defaultValues.inspecting
  )
  const [$picker, setPicker] = createAtom(
    initialValues.picker ?? defaultValues.picker
  )
  const [$currentDocument, setCurrentDocument] = createAtom<Document | null>(
    initialValues.currentDocument ?? defaultValues.currentDocument
  )
  const [$nodeMap, setNodeMap] = createAtom<MutableNodeMap>({})
  const [$focusedNode, setFocusedNode] = createAtom<SyntheticId | null>(
    initialValues.focusedNode ?? defaultValues.focusedNode
  )
  const [$selectedNode, setSelectedNode] = createAtom<SyntheticId | null>(
    initialValues.selectedNode ?? defaultValues.selectedNode
  )
  const [$view, setView] = createAtom(initialValues.view ?? defaultValues.view)
  const [$mask, setMask] = createAtom(initialValues.mask ?? defaultValues.mask)
  const [$size, setSize] = createAtom(initialValues.size ?? defaultValues.size)
  const [$snap, setSnap] = createAtom<Snap>(
    initialValues.snap ?? defaultValues.snap
  )
  const [$consoleSearch, setConsoleSearch] = createAtom(
    initialValues.consoleSearch ?? defaultValues.consoleSearch
  )
  const [$consoleLevelFilter, setConsoleLevelFilter] = createAtom(
    initialValues.consoleLevelFilter ?? defaultValues.consoleLevelFilter
  )

  return {
    $inspecting,
    $picker,
    $currentDocument,
    $nodeMap,
    $focusedNode,
    $selectedNode,
    $view,
    $mask,
    $size,
    $snap,
    $consoleSearch,
    $consoleLevelFilter,

    setInspecting,
    setPicker,
    setCurrentDocument,
    setNodeMap,
    setFocusedNode,
    setSelectedNode,
    setView,
    setMask,
    setSize,
    setSnap,
    setConsoleSearch,
    setConsoleLevelFilter,
  }
}
