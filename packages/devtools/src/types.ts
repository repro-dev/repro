import { SyntheticId } from '@repro/domain'

export type Snap = 'bottom' | 'right'

export enum View {
  Elements,
  Network,
  Performance,
  Console,
  Settings,
  React,
  Redux,
}

export type MutableNodeMap = Record<SyntheticId, Node>
