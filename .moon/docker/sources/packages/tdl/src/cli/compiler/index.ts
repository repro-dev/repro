import * as prettier from 'prettier'

import {
  ASTNodeType,
  ImportDeclarationNode,
  StatementSetNode,
} from '../parser/ASTTypes'

import * as definitions from './definitions'
import * as views from './views'

function generateImportNames(name: string) {
  return `${name}, ${name}View`
}

export function generateImport(node: ImportDeclarationNode) {
  const importNames =
    node.importNames.type === ASTNodeType.SingleNamedImport
      ? `{ ${generateImportNames(node.importNames.name)} }`
      : `{ ${node.importNames.names.map(generateImportNames).join(', ')} }`
  return `import ${importNames} from './${node.module.replace('.', '/')}'`
}

export function compile(node: StatementSetNode) {
  const declarations = [`import * as tdl from '@repro/tdl'`]

  for (const statement of node.statements) {
    switch (statement.type) {
      case ASTNodeType.ImportDeclaration:
        declarations.push(generateImport(statement))
        break

      case ASTNodeType.Assignment:
        declarations.push(definitions.generateAssignment(statement))
        declarations.push(views.generateAssignment(statement))
        break
    }
  }

  return prettier.format(declarations.join('\n\n'), { parser: 'typescript' })
}
