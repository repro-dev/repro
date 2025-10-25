import { StatementSetNode } from './ASTTypes'

export interface Module {
  name: string
  filename: string
  ast: StatementSetNode
}

export type Program = Array<Module>
