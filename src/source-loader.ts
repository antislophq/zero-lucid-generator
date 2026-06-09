import type { ClassDeclaration } from 'ts-morph'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import { Project } from 'ts-morph'

/**
 * Builds a ts-morph Project using the user's tsconfig.
 * We include all files from the tsconfig so that base classes
 * (e.g. UserSchema in database/schema.ts) are reachable when
 * traversing the inheritance chain.
 */
export function buildTsProject(tsConfigPath?: string): Project {
  return new Project({
    tsConfigFilePath: tsConfigPath ?? 'tsconfig.json',
  })
}

/**
 * Scans the ts-morph project for the class matching the model name,
 * then reads the TypeScript type annotation of each @column() property.
 * Traverses the full inheritance chain so columns defined on a base
 * class (e.g. UserSchema) are picked up even when the model itself
 * only extends it.
 *
 * Returns a map of attributeName → TypeScript type string.
 * e.g. { id: 'string', name: 'string', createdAt: 'DateTime | null' }
 */
export function extractColumnTypesFromSource(
  model: LucidModel,
  project: Project,
): Map<string, string> {
  const columnTypes = new Map<string, string>()

  for (const sourceFile of project.getSourceFiles()) {
    const classDecl = sourceFile.getClass(model.name)
    if (!classDecl) continue

    // Walk up the inheritance chain — derived class properties win
    let current: ClassDeclaration | undefined = classDecl
    while (current) {
      for (const prop of current.getProperties()) {
        const attributeName = prop.getName()
        if (!model.$columnsDefinitions.has(attributeName)) continue
        if (columnTypes.has(attributeName)) continue // derived class already set it

        const typeNode = prop.getTypeNode()
        if (typeNode) {
          columnTypes.set(attributeName, typeNode.getText())
        } else {
          columnTypes.set(attributeName, prop.getType().getText())
        }
      }

      current = current.getBaseClass()
    }

    break
  }

  return columnTypes
}

/**
 * Convert a snake_case DB table name to camelCase for the Zero schema.
 * e.g. "issue_labels" → "issueLabels"
 */
export function toCamelCase(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}
